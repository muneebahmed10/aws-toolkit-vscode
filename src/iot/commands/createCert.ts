/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotCertsFolderNode } from '../explorer/iotCertFolderNode'
import { fileExists } from '../../shared/filesystemUtilities'

/**
 * Wizard to create a certificate key pair and save them to the filesystem.
 */
export async function createCertificateCommand(
    node: IotCertsFolderNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreateCertificate called for %O', node)

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.createCert.prompt', 'Create a new X.509 certificate and RSA key pair?'),
            confirm: localize('AWS.iot.createCert.confirm', 'Confirm'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('CreateCertificate canceled')
        return
    }

    const folderLocation = await promptForFolderLocation(window)
    if (!folderLocation) {
        getLogger().info('CreateCertificate canceled: No folder selected')
        return
    }
    const certPath = `${folderLocation.fsPath}-certificate.pem.crt`
    const privateKeyPath = `${folderLocation.fsPath}-private.pem.key`
    const publicKeyPath = `${folderLocation.fsPath}-public.pem.key`

    const certExists = await fileExists(certPath)
    const privateKeyExists = await fileExists(privateKeyPath)
    const publicKeyExists = await fileExists(publicKeyPath)

    if (certExists) {
        getLogger().error('Certificate path {0} already exists', certPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }
    if (privateKeyExists) {
        getLogger().error('Key path {0} already exists', privateKeyPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }
    if (publicKeyExists) {
        getLogger().error('Key path {0} already exists', publicKeyPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }

    try {
        await node.iot.createCertificateAndKeys({
            certPath: certPath,
            privateKeyPath: privateKeyPath,
            publicKeyPath: publicKeyPath,
            active: false,
        })
    } catch (e) {
        getLogger().error('Failed to create and save certificate: %O', e)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        throw e
    }

    await refreshNode(node, commands)
}

async function promptForFolderLocation(window: Window): Promise<vscode.Uri | undefined> {
    // const folderLocation = await window.showOpenDialog({
    //     openLabel: localize('AWS.iot.downloadCert.openButton', 'Save certificate here'),
    //     canSelectFolders: true,
    //     canSelectFiles: false,
    //     canSelectMany: false,
    // })

    // if (!folderLocation || folderLocation.length == 0) {
    //     return undefined
    // }

    // return folderLocation[0]
    const saveLocation = await window.showSaveDialog({})
    if (!saveLocation) {
        return undefined
    }
    return saveLocation
}

async function refreshNode(node: IotCertsFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
