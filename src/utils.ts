import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ServerInjectOptions, ServerInjectResponse } from 'hapi';
import * as _ from 'lodash';
import * as Querystring from 'querystring';
import { Headers } from 'shot';


export function removeHeader(headers: Headers, headerName: string): void {
    const upperCaseHeader = headerName.toUpperCase();
    const key = _.findKey(headers, (_value, key) => key.toUpperCase() === upperCaseHeader);
    if (key) {
        delete headers[key];
    }
}

export function isPromise<T>(val: any): val is Promise<T> {
    return typeof val.then === 'function'
}

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
        headers: event.headers || {},
    };

    const qs = Querystring.stringify(event.queryStringParameters);
    if (qs) {
        requestOptions.url += `?${qs}`;
    }

    // we can't return gzipped content, this seems to be the way to disable it in Hapi
    // https://github.com/hapijs/hapi/issues/2449
    removeHeader(requestOptions.headers, 'accept-encoding');

    if (event.body) {
        requestOptions.payload = event.body;
    }

    return requestOptions
}

export function hapiResponseToResult(res: ServerInjectResponse): APIGatewayProxyResult {
    // api gateway doesn't support chunked transfer-encoding
    // https://github.com/awslabs/aws-serverless-express/issues/10
    removeHeader(res.headers, 'transfer-encoding');

    return {
        statusCode: res.statusCode,
        headers: res.headers as any, // TODO when can a header value be an array of string?
        body: res.payload,
    };
}