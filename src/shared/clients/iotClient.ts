/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as _ from 'lodash'
import * as mime from 'mime-types'
import * as path from 'path'
import { AWSError, Iot } from 'aws-sdk'
import { inspect } from 'util'
import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { DefaultFileStreams, FileStreams, pipe, promisifyReadStream } from '../utilities/streamUtilities'
import { InterfaceNoSymbol } from '../utilities/tsUtils'

export const DEFAULT_MAX_THINGS = 250 // 250 is the maximum allowed by the API
export const DEFAULT_DELIMITER = '/'

export type IotThing = InterfaceNoSymbol<DefaultIotThing>
export type IotCertificate = InterfaceNoSymbol<DefaultIotCertificate>
export type IotPolicy = InterfaceNoSymbol<DefaultIotPolicy>
export type IotClient = InterfaceNoSymbol<DefaultIotClient>

//ARN Pattern for certificates. FIXME import @aws-sdk/util-arn-parser instead.
const CERT_ARN_PATTERN = /arn:aws:iot:\S+?:\d+:cert\/(\w+)/

interface IotObject {
    readonly key: string
    readonly versionId?: string
}

export interface ListThingsRequest {
    readonly nextToken?: Iot.NextToken
    readonly maxResults?: Iot.MaxResults
}

export interface ListThingsResponse {
    readonly things: IotThing[]
    readonly nextToken: string | undefined
}

export interface UpdateThingRequest {
    readonly thingName: Iot.ThingName
}

export interface CreateThingResponse {
    readonly thing: IotThing
}

export interface ListCertificatesRequest {
    readonly pageSize?: Iot.PageSize
    readonly marker?: Iot.Marker
    readonly ascendingOrder?: Iot.AscendingOrder
}

export interface ListCertificatesResponse {
    readonly certificates: IotCertificate[]
    readonly nextMarker: string | undefined
}

export interface ListThingCertificatesRequest {
    readonly thingName: Iot.ThingName
    readonly nextToken?: Iot.NextToken
    readonly maxResults?: Iot.MaxResults
}

export interface ListThingCertificatesResponse {
    readonly certificates: IotCertificate[]
    readonly nextToken: string | undefined
}

export interface UpdateCertificateRequest {
    readonly certificateId: Iot.CertificateId
    readonly newStatus: Iot.CertificateStatus
}

export interface ListPoliciesRequest {
    readonly principal?: Iot.Principal
    readonly pageSize?: Iot.PageSize
    readonly marker?: Iot.Marker
    readonly ascendingOrder?: Iot.AscendingOrder
}

export interface ListPoliciesResponse {
    readonly policies: IotPolicy[]
    readonly nextMarker: string | undefined
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
     * Lists Things in the region of the client.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listThings(request?: ListThingsRequest): Promise<ListThingsResponse> {
        getLogger().debug('ListThings called with request: %O', request)
        const iot = await this.createIot()

        let iotThings: Iot.ThingAttribute[]
        let nextToken: Iot.NextToken | undefined
        try {
            const output = await iot
                .listThings({
                    maxResults: request?.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request?.nextToken,
                })
                .promise()
            iotThings = output.things ?? []
            nextToken = output.nextToken
        } catch (e) {
            getLogger().error('Failed to list things: %O', e)
            throw e
        }

        // S3#ListBuckets returns buckets across all regions
        const allThingPromises: Promise<IotThing | undefined>[] = iotThings.map(async iotThing => {
            const bucketName = iotThing.thingName
            const thingArn = iotThing.thingArn
            if (!bucketName) {
                return undefined
            }
            if (!thingArn) {
                return undefined
            }
            const region = this.regionCode
            if (!region) {
                return undefined
            }
            return new DefaultIotThing({
                region: region,
                name: bucketName,
                arn: thingArn,
            })
        })

        const allThings = await Promise.all(allThingPromises)
        const filteredThings = _(allThings)
            .reject(thing => thing === undefined)
            // we don't have a filerNotNull so we can filter then cast
            .map(thing => thing as IotThing)
            .value()

        const response: ListThingsResponse = { things: filteredThings, nextToken: nextToken }
        getLogger().debug('ListThings returned response: %O', response)
        return { things: filteredThings, nextToken: nextToken }
    }

    /**
     * Creates an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async createThing(request: UpdateThingRequest): Promise<CreateThingResponse> {
        getLogger().debug('CreateBucket called with request: %O', request)
        const iot = await this.createIot()

        let thingArn: Iot.ThingArn
        let thingId: Iot.ThingId
        try {
            const output = await iot.createThing({ thingName: request.thingName }).promise()

            if (output.thingArn) {
                thingArn = output.thingArn
            } else {
                throw new Error('Thing ARN not found')
            }

            //thingArn = output.thingArn ?? throw new Error('thingArn not found')
        } catch (e) {
            getLogger().error('Failed to create Thing: %s: %O', request.thingName, e)
            throw e
        }

        const response: CreateThingResponse = {
            thing: new DefaultIotThing({
                name: request.thingName,
                region: this.regionCode,
                arn: thingArn,
            }),
        }
        getLogger().debug('CreateThing returned response: %O', response)
        return response
    }

    /**
     * Deletes an IoT Thing.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async deleteThing(request: UpdateThingRequest): Promise<void> {
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
    public async listCertificates(request: ListCertificatesRequest): Promise<ListCertificatesResponse> {
        getLogger().debug('ListCertificates called with request: %O', request)
        const iot = await this.createIot()

        let iotCerts: Iot.Certificate[]
        let nextMarker: Iot.Marker | undefined
        try {
            const output = await iot
                .listCertificates({
                    pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                    marker: request.marker,
                    ascendingOrder: request.ascendingOrder,
                })
                .promise()
            iotCerts = output.certificates ?? []
            nextMarker = output.nextMarker
        } catch (e) {
            getLogger().error('Failed to retrieve certificates: %O', e)
            throw e
        }

        const allCertsPromises: Promise<IotCertificate | undefined>[] = iotCerts.map(async iotCert => {
            const certId = iotCert.certificateId
            const certArn = iotCert.certificateArn
            const certStatus = iotCert.status
            const certDate = iotCert.creationDate
            if (!certId || !certArn || !certStatus || !certDate) {
                return undefined
            }
            return new DefaultIotCertificate({
                arn: certArn,
                id: certId,
                activeStatus: certStatus,
                creationDate: certDate,
            })
        })

        const allCerts = await Promise.all(allCertsPromises)
        const certs = _(allCerts)
            .reject(cert => cert === undefined)
            .map(cert => cert as IotCertificate)
            .value()

        const response: ListCertificatesResponse = { certificates: certs, nextMarker: nextMarker }
        getLogger().debug('ListCertificates returned response: %O', response)
        return { certificates: certs, nextMarker: nextMarker }
    }

    public async listThingCertificates(request: ListThingCertificatesRequest): Promise<ListThingCertificatesResponse> {
        getLogger().debug('ListThingCertificates called with request: %O', request)
        const iot = await this.createIot()

        let iotPrincipals: Iot.Principal[]
        let nextToken: Iot.NextToken | undefined
        try {
            const output = await iot
                .listThingPrincipals({
                    thingName: request.thingName,
                    maxResults: request.maxResults ?? DEFAULT_MAX_THINGS,
                    nextToken: request.nextToken,
                })
                .promise()
            iotPrincipals = output.principals ?? []
            nextToken = output.nextToken
        } catch (e) {
            getLogger().error('Failed to list thing principals: %O', e)
            throw e
        }

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
     * Activates, deactivates, or revokes an IoT Certificate.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async updateCertificate(request: UpdateCertificateRequest): Promise<void> {
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
     * Lists IoT policies for principal, or all policies if principal is absent.
     *
     * @throws Error if there is an error calling IoT.
     */
    public async listPolicies(request: ListPoliciesRequest): Promise<ListPoliciesResponse> {
        getLogger().debug('ListPolicies called with request: %O', request)
        const iot = await this.createIot()

        let iotPolicies: Iot.Policy[]
        let nextMarker: Iot.Marker | undefined
        try {
            const output = request.principal
                ? await iot
                      .listPrincipalPolicies({
                          principal: request.principal,
                          pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                          marker: request.marker,
                          ascendingOrder: request.ascendingOrder,
                      })
                      .promise()
                : await iot
                      .listPolicies({
                          pageSize: request.pageSize ?? DEFAULT_MAX_THINGS,
                          marker: request.marker,
                          ascendingOrder: request.ascendingOrder,
                      })
                      .promise()

            iotPolicies = output.policies ?? []
            nextMarker = output.nextMarker
        } catch (e) {
            getLogger().error('Failed to retrieve policies: %O', e)
            throw e
        }

        const allPoliciesPromises: Promise<IotPolicy | undefined>[] = iotPolicies.map(async iotPolicy => {
            const policyName = iotPolicy.policyName
            const policyArn = iotPolicy.policyArn
            if (!policyName || !policyArn) {
                return undefined
            }
            return new DefaultIotPolicy({
                arn: policyArn,
                name: policyName,
            })
        })

        const allPolicies = await Promise.all(allPoliciesPromises)
        const policies = _(allPolicies)
            .reject(policy => policy === undefined)
            .map(policy => policy as IotPolicy)
            .value()

        const response: ListPoliciesResponse = { policies: policies, nextMarker: nextMarker }
        getLogger().debug('ListCertificates returned response: %O', response)
        return { policies: policies, nextMarker: nextMarker }
    }
}

export class DefaultIotThing {
    public readonly name: string
    public readonly region: string
    public readonly arn: string

    public constructor({ region, name, arn }: { region: string; name: string; arn: string }) {
        this.name = name
        this.region = region
        this.arn = arn
    }

    public [inspect.custom](): string {
        return `Thing (name=${this.name}, region=${this.region}, arn=${this.arn})`
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
