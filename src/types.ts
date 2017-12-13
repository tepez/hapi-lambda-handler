import * as Hapi from 'hapi'
import * as AwsLambda from 'aws-lambda'


export interface ISetCredentialsFn {
    (event: AwsLambda.APIGatewayEvent, context: AwsLambda.Context, request: Hapi.InjectedRequestOptions): void
}

export interface IInjectOptions {
    // The basePath in a custom path mapping
    // http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html
    basePath?: string

    // Given the event and the context, apply the credentials on the request
    // Note that it might not be by actually settings the `credentials` options
    // We might set headers that will be used by the auth strategy in Hapi
    setCredentials?: ISetCredentialsFn
}
