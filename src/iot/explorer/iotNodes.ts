/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotClient } from '../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { inspect } from 'util'
import { IotThingFolderNode } from './iotThingFolderNode'
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'

/**
 * An AWS Explorer node representing IoT.
 *
 * Contains folders for Things, Certificates, and Policies as child nodes.
 */
export class IotNode extends AWSTreeNodeBase {
    public thingFolderNode: LoadMoreNode | undefined
    public certFolderNode: LoadMoreNode | undefined
    public policyFolderNode: LoadMoreNode | undefined

    public constructor(private readonly iot: IotClient) {
        super('IoT', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsIotNode'
        // this.thingFolderNode = new IotThingFolderNode(this.iot, this)
        // this.certFolderNode = new IotCertsFolderNode(this.iot, this)
        // this.policyFolderNode = new IotPolicyFolderNode(this.iot, this)
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const thingFolderNode = new IotThingFolderNode(this.iot, this)
                this.thingFolderNode = thingFolderNode
                const certFolderNode = new IotCertsFolderNode(this.iot, this)
                this.certFolderNode = certFolderNode
                const policyFolderNode = new IotPolicyFolderNode(this.iot, this)
                this.policyFolderNode = policyFolderNode
                const categories: AWSTreeNodeBase[] = [thingFolderNode, certFolderNode, policyFolderNode]
                return categories
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noThings', '[No Things found]')),
        })
    }

    public async getEndpoint(): Promise<string> {
        return await this.iot.getEndpoint()
    }

    public [inspect.custom](): string {
        return 'IotNode'
    }
}
