/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotNode } from './explorer/iotNodes'
import { IotThingNode } from './explorer/iotThingNode'
import { ExtContext } from '../shared/extensions'
import { IotThingFolderNode } from './explorer/iotThingFolderNode'
import { createThingCommand } from './commands/createThing'
import { deleteThingCommand } from './commands/deleteThing'

/**
 * Activate API Gateway functionality for the extension.
 */
export async function activate(activateArguments: {
    extContext: ExtContext
    outputChannel: vscode.OutputChannel
}): Promise<void> {
    const extensionContext = activateArguments.extContext.extensionContext
    const regionProvider = activateArguments.extContext.regionProvider

    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.iot.createThing', async (node: IotThingFolderNode) => {
            await createThingCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deleteThing', async (node: IotThingNode) => {
            await deleteThingCommand(node)
        })
    )
}
