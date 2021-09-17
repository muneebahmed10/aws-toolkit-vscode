/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { IotThing, IotClient } from '../../shared/clients/iotClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotNode } from './iotNodes'
import { IotThingFolderNode } from './iotThingFolderNode'

/**
 * Represents an S3 bucket that may contain folders and/or objects.
 */
export class IotThingNode extends AWSTreeNodeBase implements AWSResourceNode {
    //private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly thing: IotThing,
        public readonly parent: IotThingFolderNode,
        public readonly iot: IotClient,
        private readonly workspace = Workspace.vscode()
    ) {
        super(thing.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = thing.name
        // this.iconPath = {
        //     dark: vscode.Uri.file(ext.iconPaths.dark.s3),
        //     light: vscode.Uri.file(ext.iconPaths.light.s3),
        // }
        this.contextValue = 'awsIotThingNode'
    }

    /**
     * See {@link IotClient.deleteThing}
     */
    public async deleteThing(): Promise<void> {
        await this.iot.deleteThing({ thingName: this.thing.name })
    }

    public get arn(): string {
        return this.thing.arn
    }

    public get name(): string {
        return this.thing.name
    }

    public [inspect.custom](): string {
        return `IotThingNode (thing=${this.thing.name})`
    }
}
