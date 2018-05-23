import * as AwsLambda from 'aws-lambda'
import * as Hapi from 'hapi'


export interface IModidyRequestCb {
    (event: AwsLambda.APIGatewayEvent,
     context: AwsLambda.Context,
     request: Hapi.InjectedRequestOptions): void
}

export interface IInjectOptions {
    // The basePath in a custom path mapping
    // http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html
    basePath?: string

    // A sync callback for modifying the request before injecting it to Hapi
    modifyRequest?: IModidyRequestCb
}
