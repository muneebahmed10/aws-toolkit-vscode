/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotThing, IotClient, UpdateThingRequest, CreateThingResponse } from '../../shared/clients/iotClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { folderIconPath } from '../../shared/utilities/vsCodeUtils'
import { IotThingNode } from './iotThingNode'
import { inspect } from 'util'
import { Workspace } from '../../shared/vscode/workspace'
import { getLogger } from '../../shared/logger'

/**
 * Represents the group of all IoT Things.
 */
export class IotThingFolderNode extends AWSTreeNodeBase implements LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(public readonly iot: IotClient, private readonly workspace = Workspace.vscode()) {
        super('IoT Things', vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = 'IoT Things'
        this.iconPath = folderIconPath()
        this.contextValue = 'awsIotThingsNode'
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.iot.noThings', '[No Things found]')),
        })
    }

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.iot.listThings({
            nextToken: continuationToken,
            maxResults: this.getMaxItemsPerPage(),
        })

        const newThings = response.things.map(thing => new IotThingNode(thing, this, this.iot))

        getLogger().debug(`Loaded things: %O`, newThings)
        return {
            newContinuationToken: response.nextToken ?? undefined,
            newChildren: [...newThings],
        }
    }

    /**
     * See {@link IotClient.createThing}
     */
    public async createThing(request: UpdateThingRequest): Promise<CreateThingResponse> {
        return this.iot.createThing(request)
    }

    public [inspect.custom](): string {
        return `IotThings`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('iot.maxItemsPerPage')
    }
}
