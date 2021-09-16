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
export type IotClient = InterfaceNoSymbol<DefaultIotClient>

interface IotObject {
    readonly key: string
    readonly versionId?: string
}

export interface ListThingsRequest {
    readonly nextToken?: string
    readonly maxResults?: number
}

export interface ListThingsResponse {
    readonly things: IotThing[]
    readonly nextToken: string | undefined
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
     * Lists things in the region of the client.
     *
     * Note that S3 returns all buckets in all regions,
     * so this incurs the cost of additional S3#getBucketLocation requests for each bucket
     * to filter out buckets residing outside of the client's region.
     *
     * @throws Error if there is an error calling S3.
     */
    public async listThings(request?: ListThingsRequest): Promise<ListThingsResponse> {
        getLogger().debug('ListBuckets called')
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
        const allBucketPromises: Promise<IotThing | undefined>[] = iotThings.map(async iotThing => {
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

        const allBuckets = await Promise.all(allBucketPromises)
        const bucketsInRegion = _(allBuckets)
            .reject(thing => thing === undefined)
            // we don't have a filerNotNull so we can filter then cast
            .map(thing => thing as IotThing)
            .value()

        const response: ListThingsResponse = { things: bucketsInRegion, nextToken: nextToken }
        getLogger().debug('ListBuckets returned response: %O', response)
        return { things: bucketsInRegion, nextToken: nextToken }
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

async function createSdkClient(regionCode: string): Promise<Iot> {
    return await ext.sdkClientBuilder.createAwsService(Iot, undefined, regionCode)
}
