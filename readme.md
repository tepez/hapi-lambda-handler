# hapi-lambda-handler
> Run Hapi server on AWS Lambda

[![npm version](https://badge.fury.io/js/%40tepez%2Fhapi-lambda-handler.svg)](https://badge.fury.io/js/%40tepez%2Fhapi-lambda-handler)
[![Build Status](https://secure.travis-ci.org/tepez/hapi-lambda-handler.svg?branch=master)](http://travis-ci.org/tepez/hapi-lambda-handler)

## Install

```
npm install --save @tepez/hapi-lambda-handler
```

## Usage

```
// handler.js
const HapiLambdaHandler = require('@tepez/hapi-lambda-handler');
const Hapi = require('hapi');

cosnt server = new Hapi.Server();
server.connection({});
server.route({
    method: 'GET',
    path: '/health',
    handler: (request, reply) => reply({ status: 'ok' })
});

exports.handler = HapiLambdaHandler.handlerFromServer(server);
```

## API

### `handlerFromServer(server, [injectOptions])`
Return a Lambda Proxy handler function that handles event, context and callback as passed by a lambda-proxy integration of AWS Api Gateway.

- `server`:
  The Hapi server or a promise to it if it has to be initialized first.

  It is the **responsibility** of the using package to report initialziation errors in the server.
  If the promise to the server rejects, 500 errros will be returned for every request.

- `injectOptions`:
    - `basePath: string`

      If the API is deployed under a [custom path mapping](http://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-apigateway-basepathmapping.html)
      this should be the basePath, e.g. '/v1.0'.

    - `modifyRequest: (event: AwsLambda.APIGatewayEvent, context: AwsLambda.Context, request: Hapi.InjectedRequestOptions) => void`

      A synchronous callback receiving the `event`, the `context` and the `request` just before injecting it to the Hapi server.
      This is a chance to modify the request in-place, e.g. to apply credentials to it.
