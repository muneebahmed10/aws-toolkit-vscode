/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Window } from '../../shared/vscode/window'
import { getLogger } from '../../shared/logger/logger'
import { showConfirmationMessage, showViewLogsMessage } from '../../shared/utilities/messages'
import { millisecondsSince, recordDynamicresourceMutateResource, Result } from '../../shared/telemetry/telemetry'
import { CloudControlClient } from '../../shared/clients/cloudControlClient'
const localize = nls.loadMessageBundle()

export async function deleteResource(
    cloudControl: CloudControlClient,
    typeName: string,
    identifier: string,
    window = Window.vscode()
): Promise<boolean> {
    getLogger().info(`deleteResource called for type ${typeName} identifier ${identifier}`)
    const ok = await showConfirmationMessage(
        {
            prompt: localize('aws.resources.deleteResource.prompt', 'Delete resource {0} ({1})?', identifier, typeName),
            confirm: localize('AWS.generic.delete', 'Delete'),
            cancel: localize('AWS.generic.cancel', 'Cancel'),
        },
        window
    )
    if (!ok) {
        getLogger().info(`Cancelled delete resource type ${typeName} identifier ${identifier}`)
        return false
    }

    return await window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            cancellable: false,
        },
        async progress => {
            let result: Result = 'Succeeded'
            const startTime = new Date()

            try {
                progress.report({
                    message: `Deleting resource ${identifier} (${typeName})...`,
                })

                await cloudControl.deleteResource({
                    TypeName: typeName,
                    Identifier: identifier,
                })

                getLogger().info(`Deleted resource type ${typeName} identifier ${identifier}`)

                window.showInformationMessage(
                    localize('aws.resources.deleteResource.success', 'Deleted resource {0} ({1})', identifier, typeName)
                )
                return true
            } catch (e) {
                const error = e as Error
                if (error.name === 'UnsupportedActionException') {
                    result = 'Cancelled'
                    getLogger().warn(
                        `Resource type ${typeName} does not support DELETE action in ${cloudControl.regionCode}`
                    )
                    window.showWarningMessage(
                        localize(
                            'aws.resources.deleteResource.unsupported',
                            'Resource type {0} does not currently support delete in {1}',
                            typeName,
                            cloudControl.regionCode
                        )
                    )
                    return false
                }
                result = 'Failed'
                getLogger().error(`Failed to delete resource type ${typeName} identifier ${identifier}: %O`, e)
                showViewLogsMessage(
                    localize(
                        'aws.resources.deleteResource.failure',
                        'Failed to delete resource {0} ({1})',
                        identifier,
                        typeName
                    ),
                    window
                )
                return false
            } finally {
                recordDynamicresourceMutateResource({
                    dynamicResourceOperation: 'Delete',
                    duration: millisecondsSince(startTime),
                    resourceType: typeName,
                    result: result,
                })
            }
        }
    )
}
