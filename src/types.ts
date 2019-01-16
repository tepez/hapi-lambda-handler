import { APIGatewayEvent, APIGatewayProxyEvent, Context } from 'aws-lambda'
import * as Hapi from 'hapi'


export interface IModifyRequestCb {
    (event: APIGatewayEvent,
     context: Context,
     request: Hapi.InjectedRequestOptions): void
}

export interface IInjectOptions {
    // The basePath in a custom path mapping
    // http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html
    basePath?: string

    // A sync callback for modifying the request before injecting it to Hapi
    modifyRequest?: IModifyRequestCb
}
