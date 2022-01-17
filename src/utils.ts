import { ServerInjectOptions, ServerInjectResponse } from '@hapi/hapi';
import { Headers } from '@hapi/shot';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as Querystring from 'querystring';

export function isPromise<T>(val: any): val is Promise<T> {
    return typeof val.then === 'function'
}

/**
 * Determine the real user IP from a request
 * If the x-forwarded-for header is present, take the first IP there
 */
export const realUserIp = (headers: Headers): string => {
    const forwardedFor = headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string') {
        return forwardedFor.split(/\s*,\s*/)[0];
    }
    return null;
};

export function eventToHapiRequest(event: APIGatewayEvent, basePath: string): ServerInjectOptions {
    let url = event.path;

    // when accessing the route using a custom domain, we need to ignore the base path,
    // e.g. '/dev-docs-sets/docsSet' => '/docsSet'
    // when accessing the route using the lambda endpoint, we don't need to remove the base path
    if (basePath && url.indexOf(basePath) === 0) {
        url = url.substr(basePath.length);
    }

    const requestOptions: ServerInjectOptions = {
        method: event.httpMethod,
        url: url,
        headers: Object.entries(event.multiValueHeaders || {})
            .reduce((collect, [name, value]) => ({
                ...collect,
                // While node will normalize to lowercase anyhow, we normalize to lower case
                // for realUserIp
                [name.toLocaleLowerCase()]: (value.length === 1) ? value[0] : value,
            }), {}),
    };

    const remoteAddress = realUserIp(requestOptions.headers);
    if (remoteAddress) requestOptions.remoteAddress = remoteAddress;

    const qs = Querystring.stringify(event.multiValueQueryStringParameters);
    if (qs) {
        requestOptions.url += `?${qs}`;
    }

    // we can't return gzipped content, this seems to be the way to disable it in Hapi
    // https://github.com/hapijs/hapi/issues/2449
    delete requestOptions.headers['accept-encoding'];

    if (event.body) {
        requestOptions.payload = event.body;
    }

    return requestOptions;
}

export function hapiResponseToResult(res: ServerInjectResponse): APIGatewayProxyResult {
    // api gateway doesn't support chunked transfer-encoding
    // https://github.com/awslabs/aws-serverless-express/issues/10
    delete res.headers['transfer-encoding'];

    return {
        statusCode: res.statusCode,
        multiValueHeaders: Object.entries(res.headers)
            .reduce((collect, [name, value]) => ({
                ...collect,
                [name]: [].concat(value),
            }), {}),
        body: res.payload,
    };
}