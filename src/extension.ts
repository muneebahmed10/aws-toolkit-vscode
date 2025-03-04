/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { join } from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'

import { activate as activateAwsExplorer } from './awsexplorer/activation'
import { activate as activateCdk } from './cdk/activation'
import { activate as activateCloudWatchLogs } from './cloudWatchLogs/activation'
import { initialize as initializeCredentials } from './credentials/activation'
import { initializeAwsCredentialsStatusBarItem } from './credentials/awsCredentialsStatusBarItem'
import { LoginManager } from './credentials/loginManager'
import { CredentialsProviderManager } from './credentials/providers/credentialsProviderManager'
import { SharedCredentialsProviderFactory } from './credentials/providers/sharedCredentialsProviderFactory'
import { activate as activateSchemas } from './eventSchemas/activation'
import { activate as activateLambda } from './lambda/activation'
import { DefaultAWSClientBuilder } from './shared/awsClientBuilder'
import { AwsContextTreeCollection } from './shared/awsContextTreeCollection'
import { DefaultToolkitClientBuilder } from './shared/clients/toolkitClientBuilder'
import { activate as activateCloudFormationTemplateRegistry } from './shared/cloudformation/activation'
import {
    documentationUrl,
    endpointsFileUrl,
    extensionSettingsPrefix,
    githubCreateIssueUrl,
    githubUrl,
} from './shared/constants'
import { DefaultAwsContext } from './shared/awsContext'
import { DefaultAWSContextCommands } from './shared/defaultAwsContextCommands'
import { ext } from './shared/extensionGlobals'
import {
    aboutToolkit,
    getIdeProperties,
    getToolkitEnvironmentDetails,
    initializeComputeRegion,
    isCloud9,
    showQuickStartWebview,
    showWelcomeMessage,
} from './shared/extensionUtilities'
import { getLogger, Logger } from './shared/logger/logger'
import { activate as activateLogger } from './shared/logger/activation'
import { DefaultRegionProvider } from './shared/regions/defaultRegionProvider'
import { EndpointsProvider } from './shared/regions/endpointsProvider'
import { FileResourceFetcher } from './shared/resourcefetcher/fileResourceFetcher'
import { HttpResourceFetcher } from './shared/resourcefetcher/httpResourceFetcher'
import { activate as activateEcr } from './ecr/activation'
import { activate as activateSam } from './shared/sam/activation'
import { DefaultSettingsConfiguration } from './shared/settingsConfiguration'
import { activate as activateTelemetry } from './shared/telemetry/activation'
import { activate as activateS3 } from './s3/activation'
import {
    recordAwsCreateCredentials,
    recordAwsHelp,
    recordAwsHelpQuickstart,
    recordAwsReportPluginIssue,
    recordAwsShowExtensionSource,
    recordToolkitInit,
} from './shared/telemetry/telemetry'
import { ExtContext } from './shared/extensions'
import { activate as activateApiGateway } from './apigateway/activation'
import { activate as activateStepFunctions } from './stepFunctions/activation'
import { activate as activateSsmDocument } from './ssmDocument/activation'
import { activate as activateDynamicResources } from './dynamicResources/activation'
import { activate as activateEcs } from './ecs/activation'
import { activate as activateAppRunner } from './apprunner/activation'
import { activate as activateIot } from './iot/activation'
import { CredentialsStore } from './credentials/credentialsStore'
import { getSamCliContext } from './shared/sam/cli/samCliContext'
import * as extWindow from './shared/vscode/window'
import { Ec2CredentialsProvider } from './credentials/providers/ec2CredentialsProvider'
import { EnvVarsCredentialsProvider } from './credentials/providers/envVarsCredentialsProvider'
import { EcsCredentialsProvider } from './credentials/providers/ecsCredentialsProvider'
import { SchemaService } from './shared/schemas'
import { AwsResourceManager } from './dynamicResources/awsResourceManager'

let localize: nls.LocalizeFunc

export async function activate(context: vscode.ExtensionContext) {
    await initializeComputeRegion()
    const activationStartedOn = Date.now()
    localize = nls.loadMessageBundle()
    ext.init(context, extWindow.Window.vscode())

    const toolkitOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.toolkit', '{0} Toolkit', getIdeProperties().company)
    )
    await activateLogger(context, toolkitOutputChannel)
    const remoteInvokeOutputChannel = vscode.window.createOutputChannel(
        localize('AWS.channel.aws.remoteInvoke', '{0} Remote Invocations', getIdeProperties().company)
    )
    ext.outputChannel = toolkitOutputChannel

    try {
        initializeCredentialsProviderManager()

        initializeIconPaths(context)
        initializeManifestPaths(context)

        const toolkitSettings = new DefaultSettingsConfiguration(extensionSettingsPrefix)

        const endpointsProvider = makeEndpointsProvider()

        const awsContext = new DefaultAwsContext(context)
        ext.awsContext = awsContext
        const awsContextTrees = new AwsContextTreeCollection()
        const regionProvider = new DefaultRegionProvider(endpointsProvider)
        const credentialsStore = new CredentialsStore()
        const loginManager = new LoginManager(awsContext, credentialsStore)

        const toolkitEnvDetails = getToolkitEnvironmentDetails()
        // Splits environment details by new line, filter removes the empty string
        toolkitEnvDetails
            .split(/\r?\n/)
            .filter(x => x)
            .forEach(line => getLogger().info(line))

        await initializeAwsCredentialsStatusBarItem(awsContext, context)
        ext.regionProvider = regionProvider
        ext.awsContextCommands = new DefaultAWSContextCommands(
            awsContext,
            awsContextTrees,
            regionProvider,
            loginManager
        )
        ext.sdkClientBuilder = new DefaultAWSClientBuilder(awsContext)
        ext.toolkitClientBuilder = new DefaultToolkitClientBuilder(regionProvider)
        ext.schemaService = new SchemaService(context)
        ext.resourceManager = new AwsResourceManager(context)

        await initializeCredentials({
            extensionContext: context,
            awsContext: awsContext,
            settingsConfiguration: toolkitSettings,
        })

        await activateTelemetry({
            extensionContext: context,
            awsContext: awsContext,
            toolkitSettings: toolkitSettings,
        })
        await ext.telemetry.start()
        await ext.schemaService.start()

        const extContext: ExtContext = {
            extensionContext: context,
            awsContext: awsContext,
            samCliContext: getSamCliContext,
            regionProvider: regionProvider,
            settings: toolkitSettings,
            outputChannel: toolkitOutputChannel,
            telemetryService: ext.telemetry,
            credentialsStore,
        }

        // Used as a command for decoration-only codelenses.
        context.subscriptions.push(vscode.commands.registerCommand('aws.doNothingCommand', () => {}))

        context.subscriptions.push(
            vscode.commands.registerCommand('aws.login', async () => await ext.awsContextCommands.onCommandLogin())
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.logout', async () => await ext.awsContextCommands.onCommandLogout())
        )

        context.subscriptions.push(
            vscode.commands.registerCommand('aws.credential.profile.create', async () => {
                try {
                    await ext.awsContextCommands.onCommandCreateCredentialsProfile()
                } finally {
                    recordAwsCreateCredentials()
                }
            })
        )

        // register URLs in extension menu
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.help', async () => {
                vscode.env.openExternal(vscode.Uri.parse(documentationUrl))
                recordAwsHelp()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.github', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubUrl))
                recordAwsShowExtensionSource()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.createIssueOnGitHub', async () => {
                vscode.env.openExternal(vscode.Uri.parse(githubCreateIssueUrl))
                recordAwsReportPluginIssue()
            })
        )
        context.subscriptions.push(
            vscode.commands.registerCommand('aws.quickStart', async () => {
                try {
                    await showQuickStartWebview(context)
                } finally {
                    recordAwsHelpQuickstart({ result: 'Succeeded' })
                }
            })
        )

        context.subscriptions.push(
            vscode.commands.registerCommand('aws.aboutToolkit', async () => {
                await aboutToolkit()
            })
        )

        await activateCloudFormationTemplateRegistry(context)

        await activateCdk({
            extensionContext: extContext.extensionContext,
        })

        await activateAwsExplorer({
            awsContext,
            awsContextTrees,
            regionProvider,
            toolkitOutputChannel,
            remoteInvokeOutputChannel,
        })

        await activateAppRunner(extContext)

        await activateApiGateway({
            extContext: extContext,
            outputChannel: remoteInvokeOutputChannel,
        })

        await activateLambda(extContext)

        await activateSsmDocument(context, awsContext, regionProvider, toolkitOutputChannel)

        await activateSam(extContext)

        await activateS3(extContext)

        await activateEcr(context)

        await activateCloudWatchLogs(context, toolkitSettings)

        await activateDynamicResources(context)

        await activateIot(extContext)

        await activateEcs(extContext)

        // Features which aren't currently functional in Cloud9
        if (!isCloud9()) {
            await activateSchemas({
                context: extContext.extensionContext,
                outputChannel: toolkitOutputChannel,
            })
        }

        setImmediate(async () => {
            await activateStepFunctions(context, awsContext, toolkitOutputChannel)
        })

        showWelcomeMessage(context)

        recordToolkitInitialization(activationStartedOn, getLogger())

        ext.telemetry.assertPassiveTelemetry(ext.didReload())
    } catch (error) {
        const stacktrace = (error as Error).stack?.split('\n')
        // truncate if the stacktrace is unusually long
        if (stacktrace !== undefined && stacktrace.length > 40) {
            stacktrace.length = 40
        }
        getLogger('channel').error(
            localize(
                'AWS.channel.aws.toolkit.activation.error',
                'Error Activating {0} Toolkit: {1} \n{2}',
                getIdeProperties().company,
                (error as Error).message,
                stacktrace?.join('\n')
            )
        )
        throw error
    }
}

export async function deactivate() {
    await ext.telemetry.shutdown()
    await ext.resourceManager.dispose()
}

function initializeIconPaths(context: vscode.ExtensionContext) {
    ext.iconPaths.dark.help = isCloud9()
        ? context.asAbsolutePath('resources/dark/cloud9/help.svg')
        : context.asAbsolutePath('resources/dark/help.svg')
    ext.iconPaths.light.help = isCloud9()
        ? context.asAbsolutePath('resources/light/cloud9/help.svg')
        : context.asAbsolutePath('resources/light/help.svg')

    ext.iconPaths.dark.cloudFormation = context.asAbsolutePath('resources/dark/cloudformation.svg')
    ext.iconPaths.light.cloudFormation = context.asAbsolutePath('resources/light/cloudformation.svg')

    ext.iconPaths.dark.ecr = context.asAbsolutePath('resources/dark/ecr.svg')
    ext.iconPaths.light.ecr = context.asAbsolutePath('resources/light/ecr.svg')

    ext.iconPaths.dark.lambda = context.asAbsolutePath('resources/dark/lambda.svg')
    ext.iconPaths.light.lambda = context.asAbsolutePath('resources/light/lambda.svg')

    ext.iconPaths.dark.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/dark/gear.svg')
    ext.iconPaths.light.settings = context.asAbsolutePath('third-party/resources/from-vscode-icons/light/gear.svg')

    ext.iconPaths.dark.registry = context.asAbsolutePath('resources/dark/registry.svg')
    ext.iconPaths.light.registry = context.asAbsolutePath('resources/light/registry.svg')

    ext.iconPaths.dark.s3 = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    ext.iconPaths.light.s3 = context.asAbsolutePath('resources/light/s3/bucket.svg')

    ext.iconPaths.dark.folder = context.asAbsolutePath('third-party/resources/from-vscode/dark/folder.svg')
    ext.iconPaths.light.folder = context.asAbsolutePath('third-party/resources/from-vscode/light/folder.svg')

    ext.iconPaths.dark.file = context.asAbsolutePath('third-party/resources/from-vscode/dark/document.svg')
    ext.iconPaths.light.file = context.asAbsolutePath('third-party/resources/from-vscode/light/document.svg')

    ext.iconPaths.dark.schema = context.asAbsolutePath('resources/dark/schema.svg')
    ext.iconPaths.light.schema = context.asAbsolutePath('resources/light/schema.svg')

    ext.iconPaths.dark.apprunner = context.asAbsolutePath('resources/dark/apprunner.svg')
    ext.iconPaths.light.apprunner = context.asAbsolutePath('resources/light/apprunner.svg')

    ext.iconPaths.dark.statemachine = context.asAbsolutePath('resources/dark/stepfunctions/preview.svg')
    ext.iconPaths.light.statemachine = context.asAbsolutePath('resources/light/stepfunctions/preview.svg')

    ext.iconPaths.dark.cloudWatchLogGroup = context.asAbsolutePath('resources/dark/log-group.svg')
    ext.iconPaths.light.cloudWatchLogGroup = context.asAbsolutePath('resources/light/log-group.svg')

    ext.iconPaths.dark.createBucket = context.asAbsolutePath('resources/dark/s3/create-bucket.svg')
    ext.iconPaths.light.createBucket = context.asAbsolutePath('resources/light/s3/create-bucket.svg')

    ext.iconPaths.dark.bucket = context.asAbsolutePath('resources/dark/s3/bucket.svg')
    ext.iconPaths.light.bucket = context.asAbsolutePath('resources/light/s3/bucket.svg')

    ext.iconPaths.dark.thing = context.asAbsolutePath('resources/dark/iot/thing.svg')
    ext.iconPaths.light.thing = context.asAbsolutePath('resources/light/iot/thing.svg')

    ext.iconPaths.dark.certificate = context.asAbsolutePath('resources/dark/iot/certificate.svg')
    ext.iconPaths.light.certificate = context.asAbsolutePath('resources/light/iot/certificate.svg')

    ext.iconPaths.dark.policy = context.asAbsolutePath('resources/dark/iot/policy.svg')
    ext.iconPaths.light.policy = context.asAbsolutePath('resources/light/iot/policy.svg')

    ext.iconPaths.light.cluster = context.asAbsolutePath('resources/light/ecs/cluster.svg')
    ext.iconPaths.dark.cluster = context.asAbsolutePath('resources/dark/ecs/cluster.svg')

    ext.iconPaths.light.service = context.asAbsolutePath('resources/light/ecs/service.svg')
    ext.iconPaths.dark.service = context.asAbsolutePath('resources/dark/ecs/service.svg')

    ext.iconPaths.light.container = context.asAbsolutePath('resources/light/ecs/container.svg')
    ext.iconPaths.dark.container = context.asAbsolutePath('resources/dark/ecs/container.svg')

    // temporary icons while Cloud9 does not have Codicon support
    ext.iconPaths.dark.plus = context.asAbsolutePath('resources/dark/plus.svg')
    ext.iconPaths.light.plus = context.asAbsolutePath('resources/light/plus.svg')

    ext.iconPaths.dark.edit = context.asAbsolutePath('resources/dark/edit.svg')
    ext.iconPaths.light.edit = context.asAbsolutePath('resources/light/edit.svg')

    ext.iconPaths.dark.sync = context.asAbsolutePath('resources/dark/sync.svg')
    ext.iconPaths.light.sync = context.asAbsolutePath('resources/light/sync.svg')

    ext.iconPaths.dark.syncIgnore = context.asAbsolutePath('resources/dark/sync-ignore.svg')
    ext.iconPaths.light.syncIgnore = context.asAbsolutePath('resources/light/sync-ignore.svg')

    ext.iconPaths.dark.refresh = context.asAbsolutePath('resources/dark/refresh.svg')
    ext.iconPaths.light.refresh = context.asAbsolutePath('resources/light/refresh.svg')

    ext.iconPaths.dark.exit = context.asAbsolutePath('resources/dark/exit.svg')
    ext.iconPaths.light.exit = context.asAbsolutePath('resources/light/exit.svg')
}

function initializeManifestPaths(extensionContext: vscode.ExtensionContext) {
    ext.manifestPaths.endpoints = extensionContext.asAbsolutePath(join('resources', 'endpoints.json'))
    ext.manifestPaths.lambdaSampleRequests = extensionContext.asAbsolutePath(
        join('resources', 'vs-lambda-sample-request-manifest.xml')
    )
}

function initializeCredentialsProviderManager() {
    const manager = CredentialsProviderManager.getInstance()
    manager.addProviderFactory(new SharedCredentialsProviderFactory())
    manager.addProviders(new Ec2CredentialsProvider(), new EcsCredentialsProvider(), new EnvVarsCredentialsProvider())
}

function makeEndpointsProvider(): EndpointsProvider {
    const localManifestFetcher = new FileResourceFetcher(ext.manifestPaths.endpoints)
    const remoteManifestFetcher = new HttpResourceFetcher(endpointsFileUrl, { showUrl: true })

    const provider = new EndpointsProvider(localManifestFetcher, remoteManifestFetcher)
    // Start the load without waiting. It raises events as fetchers retrieve data.
    provider.load().catch((err: Error) => {
        getLogger().error('Failure while loading Endpoints Manifest: %O', err)

        vscode.window.showErrorMessage(
            `${localize(
                'AWS.error.endpoint.load.failure',
                'The {0} Toolkit was unable to load endpoints data.',
                getIdeProperties().company
            )} ${
                isCloud9()
                    ? localize(
                          'AWS.error.impactedFunctionalityReset.cloud9',
                          'Toolkit functionality may be impacted until the Cloud9 browser tab is refreshed.'
                      )
                    : localize(
                          'AWS.error.impactedFunctionalityReset.vscode',
                          'Toolkit functionality may be impacted until VS Code is restarted.'
                      )
            }`
        )
    })

    return provider
}

function recordToolkitInitialization(activationStartedOn: number, logger?: Logger) {
    try {
        const activationFinishedOn = Date.now()
        const duration = activationFinishedOn - activationStartedOn

        recordToolkitInit({
            duration: duration,
        })
    } catch (err) {
        logger?.error(err as Error)
    }
}

// Unique extension entrypoint names, so that they can be obtained from the webpack bundle
export const awsToolkitActivate = activate
export const awsToolkitDeactivate = deactivate
