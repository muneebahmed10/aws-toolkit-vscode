/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import * as telemetry from '../../shared/telemetry/telemetry'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotThingNode } from '../explorer/iotThingNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotThingFolderNode } from '../explorer/iotThingFolderNode'

const DELETE_FILE_DISPLAY_TIMEOUT_MS = 2000

/**
 * Deletes the thing represented by the given node.
 *
 * Prompts the user for confirmation.
 * Deletes the thing.
 * Refreshes the parent node.
 */
export async function deleteThingCommand(
    node: IotThingNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DeleteThing called for %O', node)

    const thingName = node.thing.name

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.deleteThing.prompt', 'Are you sure you want to delete Thing {0}?', thingName),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DeleteThing canceled')
        //telemetry.recordS3DeleteObject({ result: 'Cancelled' })
        return
    }

    getLogger().info(`Deleting thing ${thingName}`)
    try {
        await node.deleteThing()

        getLogger().info(`Successfully deleted Thing ${thingName}`)
        window.setStatusBarMessage(
            addCodiconToString('trash', localize('AWS.iot.deleteThing.success', 'Deleted Thing {0}', node.thing.name)),
            DELETE_FILE_DISPLAY_TIMEOUT_MS
        )
        //telemetry.recordS3DeleteObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to delete Thing ${thingName}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.deleteThing.error', 'Failed to delete Thing {0}', node.thing.name),
            window
        )
        //telemetry.recordS3DeleteObject({ result: 'Failed' })
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotThingFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
