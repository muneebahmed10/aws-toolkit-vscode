/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { IotThingFolderNode } from '../explorer/iotThingFolderNode'

/**
 * Creates an IoT Thing.
 *
 * Prompts the user for the thing name.
 * Creates the thing.
 * Refreshes the node.
 */
export async function createThingCommand(
    node: IotThingFolderNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreateThing called for: %O', node)

    const thingName = await window.showInputBox({
        prompt: localize('AWS.s3.creatThing.prompt', 'Enter a new Thing name'),
        placeHolder: localize('AWS.s3.createThing.placeHolder', 'Thing Name'),
    })

    if (!thingName) {
        getLogger().info('CreateThing cancelled')
        //telemetry.recordS3CreateBucket({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Creating thing: ${thingName}`)
    try {
        const thing = await node.createThing({ thingName })

        getLogger().info('Created thing: %O', thing)
        window.showInformationMessage(localize('AWS.s3.createBucket.success', 'Created Thing: {0}', thingName))
        //telemetry.recordS3CreateBucket({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to create Thing ${thingName}: %O`, e)
        showViewLogsMessage(
            localize('AWS.s3.createBucket.error.general', 'Failed to create Thing: {0}', thingName),
            window
        )
        //telemetry.recordS3CreateBucket({ result: 'Failed' })
    }

    await refreshNode(node, commands)
}

async function refreshNode(node: IotThingFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
