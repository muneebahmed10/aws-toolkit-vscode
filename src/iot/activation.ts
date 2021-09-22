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
import { IotCertificateNode, IotCertWithPoliciesNode, IotThingCertNode } from './explorer/iotCertificateNode'
import { detachThingCertCommand } from './commands/detachCert'
import { IotPolicyNode } from './explorer/iotPolicyNode'
import { detachPolicyCommand } from './commands/detachPolicy'
import { deletePolicyCommand } from './commands/deletePolicy'
import {
    activateCertificateCommand,
    deactivateCertificateCommand,
    revokeCertificateCommand,
} from './commands/updateCert'
import { deleteCertCommand } from './commands/deleteCert'

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
        }),
        vscode.commands.registerCommand('aws.iot.deleteCert', async (node: IotCertWithPoliciesNode) => {
            await deleteCertCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deletePolicy', async (node: IotPolicyNode) => {
            await deletePolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.detachCert', async (node: IotThingCertNode) => {
            await detachThingCertCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.detachPolicy', async (node: IotPolicyNode) => {
            await detachPolicyCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.activateCert', async (node: IotCertificateNode) => {
            await activateCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.deactivateCert', async (node: IotCertificateNode) => {
            await deactivateCertificateCommand(node)
        }),
        vscode.commands.registerCommand('aws.iot.revokeCert', async (node: IotCertificateNode) => {
            await revokeCertificateCommand(node)
        })
    )
}
