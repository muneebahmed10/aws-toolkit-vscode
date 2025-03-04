/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as path from 'path'
import * as vscode from 'vscode'
import { ResourcesNode } from '../../dynamicResources/explorer/nodes/resourcesNode'
import { ResourceNode } from '../../dynamicResources/explorer/nodes/resourceNode'
import { ResourceTypeNode } from '../../dynamicResources/explorer/nodes/resourceTypeNode'
import { formatResourceModel, AwsResourceManager } from '../../dynamicResources/awsResourceManager'
import { CloudControlClient } from '../../shared/clients/cloudControlClient'
import { CloudFormationClient } from '../../shared/clients/cloudFormationClient'
import { makeTemporaryToolkitFolder, readFileAsString } from '../../shared/filesystemUtilities'
import { anything, capture, deepEqual, instance, mock, verify, when } from '../utilities/mockito'
import { FakeExtensionContext } from '../fakeExtensionContext'
import { ext } from '../../shared/extensionGlobals'
import { SchemaService } from '../../shared/schemas'
import { remove } from 'fs-extra'
import { existsSync } from 'fs'
import { ResourceTypeMetadata } from '../../dynamicResources/model/resources'

describe('ResourceManager', function () {
    let sandbox: sinon.SinonSandbox
    let cloudFormation: CloudFormationClient
    let cloudControl: CloudControlClient
    let resourceNode: ResourceNode
    let resourceTypeNode: ResourceTypeNode
    let resourceManager: AwsResourceManager
    let schemaService: SchemaService
    let tempFolder: string

    const FAKE_TYPE_NAME = 'sometype'
    const FAKE_IDENTIFIER = 'someidentifier'
    const FAKE_REGION = 'someregion'

    const fakeResourceDescription = {
        Role: 'arn:aws:iam::1234:role/service-role/fooResource',
        Name: 'fooResource',
        ANestedType: {
            Type: 'string',
            Value: 'FooBar',
        },
        ArrayType: ['foo', 'bar', 'baz'],
    }

    beforeEach(async function () {
        cloudControl = mock()
        cloudFormation = mock()
        schemaService = mock()
        sandbox = sinon.createSandbox()
        mockClients()
        tempFolder = await makeTemporaryToolkitFolder()

        const rootNode = new ResourcesNode(FAKE_REGION, instance(cloudFormation), cloudControl)
        resourceTypeNode = new ResourceTypeNode(
            rootNode,
            FAKE_TYPE_NAME,
            instance(cloudControl),
            {} as ResourceTypeMetadata
        )
        resourceNode = new ResourceNode(resourceTypeNode, FAKE_IDENTIFIER)
        const fakeContext = new FakeExtensionContext()
        fakeContext.globalStoragePath = tempFolder
        resourceManager = new AwsResourceManager(fakeContext)
        ext.schemaService = instance(schemaService)
    })

    afterEach(async function () {
        sandbox.restore()
        await resourceManager.dispose()
        await remove(tempFolder)
    })

    it('opens resources in preview mode', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {} as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.open(resourceNode, true)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'awsResource')
        assert.strictEqual(capturedUri.fsPath, `${FAKE_IDENTIFIER}.${FAKE_TYPE_NAME}.preview.json`)
        assert.strictEqual(capturedUri.query, formatResourceModel(JSON.stringify(fakeResourceDescription)))

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: true })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('opens resources in edit mode', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {} as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.open(resourceNode, false)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'file')
        assert.strictEqual(capturedUri.fsPath.endsWith(`${FAKE_IDENTIFIER}.${FAKE_TYPE_NAME}.awsResource.json`), true)

        const fileContents = JSON.parse(await readFileAsString(capturedUri.fsPath))
        assert.deepStrictEqual(fileContents, fakeResourceDescription)

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: false })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('closes existing document when reopening resource', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {
            document: mockTextDocument,
        } as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        await resourceManager.open(resourceNode, true)
        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri
        assert.strictEqual(resourceManager.fromUri(capturedUri), resourceNode)

        await resourceManager.open(resourceNode, false)
        assert.strictEqual(resourceManager.fromUri(capturedUri), undefined)
    })

    it('creates new resource documents', async function () {
        const mockTextLine = {
            range: new vscode.Range(0, 0, 0, 0),
        }
        const mockTextDocument: vscode.TextDocument = {
            lineAt: () => mockTextLine,
        } as any as vscode.TextDocument
        const mockTextEditor = {
            document: mockTextDocument,
        } as vscode.TextEditor
        const openTextDocumentStub = sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        const showTextDocumentStub = sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        const editor = await resourceManager.new(resourceTypeNode)

        const capturedUri = openTextDocumentStub.getCall(0).args[0] as vscode.Uri

        assert.strictEqual(capturedUri.scheme, 'file')
        assert.strictEqual(capturedUri.fsPath.endsWith(`new.${FAKE_TYPE_NAME}.awsResource.json`), true)

        const fileContents = JSON.parse(await readFileAsString(capturedUri.fsPath))
        assert.deepStrictEqual(fileContents, {})

        assert.strictEqual(showTextDocumentStub.getCall(0).args[0], mockTextDocument)
        assert.deepStrictEqual(showTextDocumentStub.getCall(0).args[1], { preview: false })

        assert.strictEqual(editor, mockTextEditor)
    })

    it('returns existing resource from uri', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        assert.strictEqual(resourceManager.fromUri(editor.document.uri), resourceNode)
    })

    it('returns undefined for non-existent resource from uri', function () {
        assert.strictEqual(resourceManager.fromUri(vscode.Uri.parse('foo')), undefined)
    })

    it('returns existing resource uri from resource node', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        assert.strictEqual(
            resourceManager.toUri(resourceNode)?.fsPath.toLowerCase(),
            editor.document.uri.fsPath.toLowerCase()
        )
    })

    it('returns undefined for non-existent resource from resource node', function () {
        assert.strictEqual(resourceManager.toUri(resourceNode), undefined)
    })

    it('registers schema mappings when opening in edit', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        verify(schemaService.registerMapping(anything())).once()

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [mapping] = capture(schemaService.registerMapping).last()

        const expectedSchemaLocation = path.join(tempFolder, 'sometype.schema.json')
        assert.ok(existsSync(expectedSchemaLocation))
        assert.strictEqual(mapping.type, 'json')
        assert.strictEqual(mapping.path.toLowerCase(), editor.document.uri.fsPath.toLowerCase())
        const schema = mapping.schema as vscode.Uri
        assert.strictEqual(schema.fsPath.toLowerCase(), expectedSchemaLocation.toLowerCase())
    })

    it('does not register schemas when opening in preview', async function () {
        const mockTextDocument = {} as vscode.TextDocument
        const mockTextEditor = {} as vscode.TextEditor
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves(mockTextDocument)
        sandbox.stub(vscode.window, 'showTextDocument').resolves(mockTextEditor)

        await resourceManager.open(resourceNode, true)
        verify(schemaService.registerMapping(anything())).never()
        verify(cloudFormation.describeType(anything())).never()
    })

    it('deletes resource mapping on file close', async function () {
        const editor = await resourceManager.open(resourceNode, false)
        await resourceManager.close(editor.document.uri)
        verify(schemaService.registerMapping(anything())).twice()

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [mapping] = capture(schemaService.registerMapping).last()
        assert.strictEqual(mapping.type, 'json')
        assert.strictEqual(mapping.path.toLowerCase(), editor.document.uri.fsPath.toLowerCase())
        assert.strictEqual(mapping.schema, undefined)
    })

    function mockClients(): void {
        when(
            cloudControl.getResource(
                deepEqual({
                    TypeName: FAKE_TYPE_NAME,
                    Identifier: FAKE_IDENTIFIER,
                })
            )
        ).thenResolve({
            TypeName: 'foo',
            ResourceDescription: {
                Identifier: 'bar',
                Properties: JSON.stringify(fakeResourceDescription),
            },
        })
        when(cloudFormation.describeType(FAKE_TYPE_NAME)).thenResolve({
            Schema: '{}',
        })
    }
})
