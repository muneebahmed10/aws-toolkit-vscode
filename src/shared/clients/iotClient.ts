/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as fs from 'fs-extra'
import { Iot } from 'aws-sdk'
import { inspect } from 'util'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { InterfaceNoSymbol } from '../utilities/tsUtils'

export const DEFAULT_MAX_THINGS = 250 // 250 is the maximum allowed by the API
export const DEFAULT_DELIMITER = '/'

const MODE_RW_R_R = 420 //File permission 0644 rw-r--r-- for PEM files.
const PEM_FILE_ENCODING = 'ascii'
/* ATS is recommended over the deprecated Verisign certificates */
const IOT_ENDPOINT_TYPE = 'iot:Data-ATS'

export type IotThing = InterfaceNoSymbol<DefaultIotThing>
export type IotCertificate = InterfaceNoSymbol<DefaultIotCertificate>
export type IotPolicy = InterfaceNoSymbol<DefaultIotPolicy>
export type IotClient = InterfaceNoSymbol<DefaultIotClient>

//ARN Pattern for certificates. FIXME import @aws-sdk/util-arn-parser instead.
const CERT_ARN_PATTERN = /arn:aws:iot:\S+?:\d+:cert\/(\w+)/

export interface ListThingCertificatesResponse {
    readonly certificates: IotCertificate[]
    readonly nextToken: string | undefined
}

export interface CreateCertificateRequest {
    readonly active: boolean
    readonly certPath: string
    readonly privateKeyPath: string
    readonly publicKeyPath: string
}

export interface CreatePolicyRequest {
    readonly policyName: Iot.PolicyName
    readonly documentPath: string
}

export class DefaultIotClient {
    public constructor(
        private readonly regionCode: string,
        private readonly iotProvider: (regionCode: string) => Promise<Iot> = createSdkClient
    ) {}

    private async createIot(): Promise<Iot> {
        return this.iotProvider(this.regionCode)
    }

    /**
     * Lists all things owned by the client.
     *
     *
     * @throws Error if there is an error calling S3.
     */
    public async listAllThings(): Promise<Iot.ThingAttribute[]> {
        const iot = await this.createIot()

        let iotThings: Iot.ThingAttribute[]
        try {
            const output = await iot.listThings().promise()
            iotThings = output.things ?? []
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }
        return iotThings
    }

    /**
     * Lists Things owned by the client.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThings(request?: Iot.ListThingsRequest): Promise<Iot.ListThingsResponse> {
        getLogger().debug('ListThings called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListThingsResponse
        try {
            output = await iot
                .listThings({
                    maxResults: request?.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request?.nextToken,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }

        getLogger().debug('ListThings returned response: %O', output)
        return output
    }

    /**
     * Creates an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createThing(request: Iot.CreateThingRequest): Promise<Iot.CreateThingResponse> {
        getLogger().debug('CreateBucket called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.CreateThingResponse
        try {
            output = await iot.createThing({ thingName: request.thingName }).promise()
        } catch (e) {
            getLogger().error('Failed to create Thing: %s: %O', request.thingName, e)
            throw e
        }

        getLogger().debug('CreateThing returned response: %O', output)
        return output
    }

    /**
     * Deletes an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteThing(request: Iot.DeleteThingRequest): Promise<void> {
        getLogger().debug('DeleteThing called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.deleteThing({ thingName: request.thingName }).promise()
        } catch (e) {
            getLogger().error('Failed to delete Thing: %O', e)
            throw e
        }

        getLogger().debug('DeleteThing successful')
    }

    /**
     * Lists all IoT certificates in account.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listCertificates(request: Iot.ListCertificatesRequest): Promise<Iot.ListCertificatesResponse> {
        getLogger().debug('ListCertificates called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListCertificatesResponse
        try {
            output = await iot
                .listCertificates({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve certificates: %O', e)
            throw e
        }

        getLogger().debug('ListCertificates returned response: %O', output)
        return output
    }

    /**
     * Lists all principals attached to IoT Thing.
     *
     * Returns ARNS of principals that may be X.509 certificates, IAM
     * users/groups/roles, or Amazon Cognito identities.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingPrincipals(
        request: Iot.ListThingPrincipalsRequest
    ): Promise<Iot.ListThingPrincipalsResponse> {
        const iot = await this.createIot()

        let output: Iot.ListThingPrincipalsResponse
        try {
            output = await iot
                .listThingPrincipals({
                    thingName: request.thingName,
                    maxResults: request.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request.nextToken,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to list thing principals: %O', e)
            throw e
        }
        return output
    }

    /**
     * Lists all IoT certificates attached to IoT Thing.
     *
     * listThingPrincipals() returns ARNS of principals that may be X.509
     * certificates, IAM users/groups/roles, or Amazon Cognito identities.
     * The list is filtered for certificates only, and describeCertificate()
     * is called to get the information for each certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingCertificates(
        request: Iot.ListThingPrincipalsRequest
    ): Promise<ListThingCertificatesResponse> {
        getLogger().debug('ListThingCertificates called with request: %O', request)
        const iot = await this.createIot()

        const output = await this.listThingPrincipals(request)
        const iotPrincipals: Iot.Principal[] = output.principals ?? []
        const nextToken = output.nextToken

        const allCertPromises: Promise<IotCertificate | undefined>[] = iotPrincipals.map(async iotPrincipal => {
            const certIdFound = iotPrincipal.match(CERT_ARN_PATTERN)
            if (!certIdFound) {
                return undefined
            }
            const certId = certIdFound[1]
            let activationStatus: string | undefined
            let certDate: Iot.CreationDate | undefined

            //Make a request to get the status of the certificate
            try {
                const certificate = await iot
                    .describeCertificate({
                        certificateId: certId,
                    })
                    .promise()
                activationStatus = certificate.certificateDescription?.status
                certDate = certificate.certificateDescription?.creationDate
            } catch (e) {
                getLogger().error('Failed to describe thing certificate: %O', e)
                throw e
            }

            if (!activationStatus || !certDate) {
                return undefined
            }

            return new DefaultIotCertificate({
                arn: iotPrincipal,
                id: certId,
                activeStatus: activationStatus,
                creationDate: certDate,
            })
        })

        const allCerts = await Promise.all(allCertPromises)
        const filteredCerts = _(allCerts)
            .reject(cert => cert === undefined)
            // we don't have a filerNotNull so we can filter then cast
            .map(cert => cert as IotCertificate)
            .value()

        const response: ListThingCertificatesResponse = { certificates: filteredCerts, nextToken: nextToken }
        getLogger().debug('ListThingCertificates returned response: %O', response)
        return { certificates: filteredCerts, nextToken: nextToken }
    }

    /**
     * Lists Things attached to specified certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThingsForCert(request: Iot.ListPrincipalThingsRequest): Promise<string[]> {
        getLogger().debug('UpdateCertificate called with request: %O', request)
        const iot = await this.createIot()

        let iotThings: Iot.ThingName[]
        try {
            const output = await iot
                .listPrincipalThings({
                    maxResults: request.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request.nextToken,
                    principal: request.principal,
                })
                .promise()
            iotThings = output.things ?? []
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }

        getLogger().debug('ListThings returned response: %O', iotThings)
        return iotThings
    }

    /**
     * Creates an X.509 certificate with a 2048 bit RSA keypair and saves them
     * to the filesystem.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createCertificateAndKeys(request: CreateCertificateRequest): Promise<void> {
        getLogger().debug('CreateCertificate called with request: %O', request)
        const iot = await this.createIot()

        let certId: string | undefined
        let certPem: string | undefined
        let privateKey: string | undefined
        let publicKey: string | undefined
        try {
            const output = await iot
                .createKeysAndCertificate({
                    setAsActive: request.active,
                })
                .promise()
            certId = output.certificateId
            certPem = output.certificatePem
            privateKey = output.keyPair?.PrivateKey
            publicKey = output.keyPair?.PublicKey
        } catch (e) {
            getLogger().error('Failed to create certificate and keys: %O', e)
            throw e
        }

        if (!certPem || !privateKey || !publicKey) {
            getLogger().error('Could not download certificate')
            return undefined
        }

        //Save resources
        try {
            await fs.writeFile(request.certPath, certPem, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
            await fs.writeFile(request.privateKeyPath, privateKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
            await fs.writeFile(request.publicKeyPath, publicKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        } catch (e) {
            getLogger().error('Failed to write files: %O', e)
            throw e
        }
        getLogger().info(`Downloaded certificate ${certId}`)

        getLogger().debug('CreateCertificate succeeded')
    }

    /**
     * Activates, deactivates, or revokes an IoT Certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async updateCertificate(request: Iot.UpdateCertificateRequest): Promise<void> {
        getLogger().debug('UpdateCertificate called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot
                .updateCertificate({ certificateId: request.certificateId, newStatus: request.newStatus })
                .promise()
        } catch (e) {
            getLogger().error('Failed to update certificate: %O', e)
            throw e
        }

        getLogger().debug('UpdateCertificate successful')
    }

    /**
     * Deletes the specified IoT Certificate.
     *
     * Note that a certificate cannot be deleted if it is ACTIVE, or has attached
     * Things or policies. A certificate may be force deleted if it is INACTIVE
     * and has no attached Things.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteCertificate(request: Iot.DeleteCertificateRequest): Promise<void> {
        getLogger().debug('DeleteCertificate called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot
                .deleteCertificate({ certificateId: request.certificateId, forceDelete: request.forceDelete })
                .promise()
        } catch (e) {
            getLogger().error('Failed to delete certificate: %O', e)
            throw e
        }

        getLogger().debug('DeleteCertificate successful')
    }

    /**
     * Attaches the certificate specified by the principal to the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachThingPrincipal(request: Iot.AttachThingPrincipalRequest): Promise<void> {
        getLogger().debug('AttachThingPrincipal called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.attachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()
        } catch (e) {
            getLogger().error('Failed to attach certificate: %O', e)
            throw e
        }

        getLogger().debug('AttachThingPrincipal successful')
    }

    /**
     * Detaches the certificate specified by the principal from the specified Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachThingPrincipal(request: Iot.DetachThingPrincipalRequest): Promise<void> {
        getLogger().debug('DetachThingPrincipal called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.detachThingPrincipal({ thingName: request.thingName, principal: request.principal }).promise()
        } catch (e) {
            getLogger().error('Failed to detach certificate: %O', e)
            throw e
        }

        getLogger().debug('DetachThingPrincipal successful')
    }

    /**
     * Lists all IoT Policies.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicies(request: Iot.ListPoliciesRequest): Promise<Iot.ListPoliciesResponse> {
        getLogger().debug('ListPolicies called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListPoliciesResponse
        try {
            output = await iot
                .listPolicies({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve policies: %O', e)
            throw e
        }
        getLogger().debug('ListPolicies returned response: %O', output)
        return output
    }

    /**
     * Lists IoT policies for principal.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPrincipalPolicies(request: Iot.ListPrincipalPoliciesRequest): Promise<Iot.ListPoliciesResponse> {
        getLogger().debug('ListPrincipalPolicies called with request: %O', request)
        const iot = await this.createIot()

        let output: Iot.ListPrincipalPoliciesResponse
        try {
            output = await iot
                .listPrincipalPolicies({
                    principal: request.principal,
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
        } catch (e) {
            getLogger().error('Failed to retrieve policies: %O', e)
            throw e
        }
        getLogger().debug('ListPrincipalPolicies returned response: %O', output)
        return output
    }

    /**
     * Attaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async attachPolicy(request: Iot.AttachPolicyRequest): Promise<void> {
        getLogger().debug('AttachPolicy called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.attachPolicy({ policyName: request.policyName, target: request.target }).promise()
        } catch (e) {
            getLogger().error('Failed to attach policy: %O', e)
            throw e
        }

        getLogger().debug('AttachPolicy successful')
    }

    /**
     * Detaches the specified policy to the specified target certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async detachPolicy(request: Iot.DetachPolicyRequest): Promise<void> {
        getLogger().debug('DetachPolicy called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.detachPolicy({ policyName: request.policyName, target: request.target }).promise()
        } catch (e) {
            getLogger().error('Failed to detach policy: %O', e)
            throw e
        }

        getLogger().debug('DetachPolicy successful')
    }

    /**
     * Creates an policy from the given policy document.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createPolicy(request: CreatePolicyRequest): Promise<void> {
        getLogger().debug('CreatePolicy called with request: %O', request)
        const iot = await this.createIot()

        let policyArn: string | undefined
        try {
            const data = await fs.readFile(request.documentPath)
            //Parse to ensure this is a valid JSON
            const policyDocument = JSON.parse(data.toString())
            const output = await iot
                .createPolicy({
                    policyName: request.policyName,
                    policyDocument: JSON.stringify(policyDocument),
                })
                .promise()
            policyArn = output.policyArn
        } catch (e) {
            getLogger().error('Failed to create policy: %O', e)
            throw e
        }
        getLogger().info(`Created policy: ${policyArn}`)

        getLogger().debug('CreatePolicy successful')
    }

    /**
     * Deletes an IoT Policy.
     *
     * Note that a policy cannot be deleted if it is attached to a certificate,
     * or has non-default versions. A policy with non default versions must first
     * delete versions with deletePolicyVersions()
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deletePolicy(request: Iot.DeletePolicyRequest): Promise<void> {
        getLogger().debug('DeletePolicy called with request: %O', request)
        const iot = await this.createIot()

        try {
            await iot.deletePolicy({ policyName: request.policyName }).promise()
        } catch (e) {
            getLogger().error('Failed to delete Policy: %O', e)
            throw e
        }

        getLogger().debug('DeletePolicy successful')
    }

    /**
     * Retrieves the account's IoT device data endpoint.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async getEndpoint(): Promise<string> {
        getLogger().debug('GetEndpoint called')
        const iot = await this.createIot()

        let endpoint: string | undefined
        try {
            const output = await iot.describeEndpoint({ endpointType: IOT_ENDPOINT_TYPE }).promise()
            endpoint = output.endpointAddress
        } catch (e) {
            getLogger().error('Failed to retrieve endpoint: %O', e)
            throw e
        }
        if (!endpoint) {
            throw new Error('Failed to retrieve endpoint')
        }

        getLogger().debug('GetEndpoint successful')
        return endpoint
    }
}

export class DefaultIotThing {
    public readonly name: string
    public readonly arn: string

    public constructor({ name, arn }: { name: string; arn: string }) {
        this.name = name
        this.arn = arn
    }

    public [inspect.custom](): string {
        return `Thing (name=${this.name}, arn=${this.arn})`
    }
}

export class DefaultIotCertificate {
    public readonly id: string
    public readonly arn: string
    public readonly activeStatus: string
    public readonly creationDate: Date

    public constructor({
        arn,
        id,
        activeStatus,
        creationDate,
    }: {
        arn: string
        id: string
        activeStatus: string
        creationDate: Date
    }) {
        this.id = id
        this.arn = arn
        this.activeStatus = activeStatus
        this.creationDate = creationDate
    }

    public [inspect.custom](): string {
        return `Certificate (id=${this.id}, arn=${this.arn}, status=${this.activeStatus})`
    }
}

export class DefaultIotPolicy {
    public readonly name: string
    public readonly arn: string
    public readonly document: Iot.PolicyDocument | undefined
    public readonly defaultVersionId: Iot.PolicyVersionId | undefined
    public readonly lastModifiedDate: Date | undefined
    public readonly creationDate: Date | undefined

    public constructor({
        name,
        arn,
        document,
        versionId,
        creationDate,
        lastModifiedDate,
    }: {
        name: string
        arn: string
        document?: string
        versionId?: Iot.PolicyVersionId
        creationDate?: Date
        lastModifiedDate?: Date
    }) {
        this.name = name
        this.arn = arn
        this.document = document
        this.defaultVersionId = versionId
        this.creationDate = creationDate
        this.lastModifiedDate = lastModifiedDate
    }

    public [inspect.custom](): string {
        return `Policy (id=${this.name}, arn=${this.arn})`
    }
}

async function createSdkClient(regionCode: string): Promise<Iot> {
    return await ext.sdkClientBuilder.createAwsService(Iot, undefined, regionCode)
}
