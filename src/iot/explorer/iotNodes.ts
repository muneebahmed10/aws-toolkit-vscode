/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { IotThing, IotClient } from '../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { IotThingNode } from './iotThingNode'
import { inspect } from 'util'
import { IotThingFolderNode } from './iotThingFolderNode'
import { IotCertsFolderNode } from './iotCertFolderNode'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'

/**
 * An AWS Explorer node representing S3.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class IotNode extends AWSTreeNodeBase {
    public readonly thingFolderNode: IotThingFolderNode
    public readonly certFolderNode: IotCertsFolderNode
    public readonly policyFolderNode: IotPolicyFolderNode

    public constructor(private readonly iot: IotClient) {
        super('IoT', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsIotNode'
        this.thingFolderNode = new IotThingFolderNode(this.iot)
        this.certFolderNode = new IotCertsFolderNode(this.iot)
        this.policyFolderNode = new IotPolicyFolderNode(this.iot)
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const categories: AWSTreeNodeBase[] = [this.thingFolderNode, this.certFolderNode, this.policyFolderNode]
                return categories
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noThings', '[No Things found]')),
        })
    }

    public [inspect.custom](): string {
        return 'IotNode'
    }
}
