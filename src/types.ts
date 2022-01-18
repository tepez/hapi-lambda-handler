import { Request, ServerInjectOptions } from '@hapi/hapi'
import { APIGatewayEvent, APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda'


export interface IModifyRequestCb {
    (
        event: APIGatewayEvent,
        context: Context,
        request: ServerInjectOptions,
    ): void
}

export interface IInjectOptions {
    /**
     * The basePath in a custom path mapping
     * http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html
     */
    basePath?: string

    /**
     * A sync callback for modifying the request before injecting it to Hapi
     */
    modifyRequest?: IModifyRequestCb

    /**
     * Set the request ID of hapi requests to be the lambda reqest ID
     * @default true
     */
    setRequestId?: boolean
}

export interface IRequestWithTailPromises extends Request {
    app: {
        tailPromises: Promise<any>[]
    }
}

/**
 * Instead of APIGatewayProxyHandler from @types/aws-lambda since it currently doesn't work well with promises
 */
export type AsyncHandler = (event: APIGatewayProxyEvent, context: Context) => Promise<APIGatewayProxyResult>