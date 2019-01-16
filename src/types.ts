import { APIGatewayEvent, Context } from 'aws-lambda'
import { Request, ServerInjectOptions } from 'hapi'


export interface IModifyRequestCb {
    (event: APIGatewayEvent,
     context: Context,
     request: ServerInjectOptions): void
}

export interface IInjectOptions {
    // The basePath in a custom path mapping
    // http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html
    basePath?: string

    // A sync callback for modifying the request before injecting it to Hapi
    modifyRequest?: IModifyRequestCb
}

export interface IRequestWithTailPromises extends Request {
    app: {
        tailPromises: Promise<any>[]
    }
}