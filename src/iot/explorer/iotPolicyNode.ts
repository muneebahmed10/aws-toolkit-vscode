/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { IotClient, IotPolicy } from '../../shared/clients/iotClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Workspace } from '../../shared/vscode/workspace'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { IotPolicyFolderNode } from './iotPolicyFolderNode'
import { IotCertificateNode } from './iotCertificateNode'

/**
 * Represents an IoT Policy that may have either a Certificate Node or the
 * Policy Folder Node as a parent.
 */
export class IotPolicyNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly policy: IotPolicy,
        public readonly parent: IotPolicyFolderNode | IotCertificateNode,
        public readonly iot: IotClient,
        protected readonly workspace = Workspace.vscode()
    ) {
        super(policy.name)
        this.tooltip = policy.name
        // this.iconPath = {
        //     dark: vscode.Uri.file(ext.iconPaths.dark.s3),
        //     light: vscode.Uri.file(ext.iconPaths.light.s3),
        // }
        this.contextValue = `awsIotPolicyNode.${this.parent.contextValue}`
    }

    /**
     * See {@link IotClient.detachPolicy}
     */
    public async detachPolicy(): Promise<void> {
        if (this.parent instanceof IotPolicyFolderNode) {
            return undefined
        }
        await this.iot.detachPolicy({ policyName: this.policy.name, target: this.parent.certificate.arn })
    }

    /**
     * See {@link IotClient.deletePolicy}
     */
    public async deletePolicy(): Promise<void> {
        await this.iot.deletePolicy({ policyName: this.policy.name })
    }

    public get arn(): string {
        return this.policy.arn
    }

    public get name(): string {
        return this.policy.name
    }

    public [inspect.custom](): string {
        return `IotPolicyNode (policy=${this.policy.name})`
    }
}
