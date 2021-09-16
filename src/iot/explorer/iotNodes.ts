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

/**
 * An AWS Explorer node representing S3.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class IotNode extends AWSTreeNodeBase {
    public constructor(private readonly iot: IotClient) {
        super('Iot', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsIotNode'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await this.iot.listThings()

                return response.things.map(thing => new IotThingNode(thing, this, this.iot))
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noBuckets', '[No Things found]')),
        })
    }

    public [inspect.custom](): string {
        return 'IotNode'
    }
}
