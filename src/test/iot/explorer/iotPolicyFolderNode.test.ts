/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { IotNode } from '../../../iot/explorer/iotNodes'
import { IotClient, IotPolicy } from '../../../shared/clients/iotClient'
import { Iot } from 'aws-sdk'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { FakeWorkspace } from '../../shared/vscode/fakeWorkspace'
import { IotPolicyWithVersionsNode } from '../../../iot/explorer/iotPolicyNode'
import { IotPolicyFolderNode } from '../../../iot/explorer/iotPolicyFolderNode'

describe('IotPolicyFolderNode', function () {
    const nextMarker = 'nextMarker'
    const pageSize = 250

    let iot: IotClient
    const policy: Iot.Policy = { policyName: 'policy', policyArn: 'arn' }
    const expectedPolicy: IotPolicy = { name: 'policy', arn: 'arn' }

    function assertPolicyNode(node: AWSTreeNodeBase, expectedPolicy: IotPolicy): void {
        assert.ok(node instanceof IotPolicyWithVersionsNode, `Node ${node} should be a Policy Node`)
        assert.deepStrictEqual((node as IotPolicyWithVersionsNode).policy, expectedPolicy)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
    }

    beforeEach(function () {
        iot = mock()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            when(iot.listPolicies(deepEqual({ marker: undefined, pageSize }))).thenResolve({
                policies: [policy],
                nextMarker: undefined,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: pageSize },
            })
            const node = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)), workspace)
            const [policyNode, ...otherNodes] = await node.getChildren()

            assertPolicyNode(policyNode, expectedPolicy)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            when(iot.listPolicies(deepEqual({ marker: undefined, pageSize }))).thenResolve({
                policies: [policy],
                nextMarker,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 'iot.maxItemsPerPage', value: pageSize },
            })
            const node = new IotPolicyFolderNode(instance(iot), new IotNode(instance(iot)), workspace)
            const [policyNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertPolicyNode(policyNode, expectedPolicy)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
