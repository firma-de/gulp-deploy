# Gulp Deploy

[![npm version](https://img.shields.io/npm/v/@firma-de/gulp-deploy.svg)](https://www.npmjs.com/package/@firma-de/gulp-deploy)
[![build status](https://img.shields.io/circleci/project/firma-de/gulp-deploy/master.svg)](https://circleci.com/gh/firma-de/gulp-deploy)
[![dependencies](https://img.shields.io/david/firma-de/gulp-deploy.svg)](https://david-dm.org/firma-de/gulp-deploy)
[![coverage](https://img.shields.io/coveralls/firma-de/gulp-deploy/master.svg)](https://coveralls.io/github/firma-de/gulp-deploy)

Gulp module for deploying and notifying GitHub

## Description

`@firma-de/gulp-deploy` will do the following steps :

1. Create a [GitHub deploy](https://developer.github.com/v3/repos/deployments/#create-a-deployment)
2. Will append to all files the deployment id, received from GitHub
3. Will copy via SFTP to a remote server and location

## Installation

```
$ npm install @firma-de/gulp-deploy
```

## Usage

Basic usage :

```
const deploy = require("@firma-de/gulp-deploy");

return gulp
    .src( "./package/package.tar.gz" )        
    .pipe( deploy( {
       remotePath : "./build",
       host : `${your_server_ip}`,
       key : `${your_deploy_server_private_key}`,
       user : `${your_deploy_server_user}`
    } ) );
```

With this configuration `@firma-de/gulp-deploy` will copy via sftp 
`./package/package.tar.gz` to the user @ server, using the private
key you specified.

## Options

### `remotePath` - required

The directory on the remote server that will be the target of the copy.

Value : `String`

Example : `./build`

### `host` - required

The IP Address or the hostname of the target server

Value : `String`

Example : `192.168.0.1`

### `key` - required

The path to the private key, used for identification to the target 
server.

Value : `String`

Example : `~/.ssh/id_rsa`

### `user` - required

The user on the server that is linked with the private key.

Value : `String`

Example : `deployer`

### `port`

The port number to be used to connect to SSH on the remote server

Value : `Number`

Default : `22`

### `revision`

The revision ( SHA of the commit ) that is being deployed. 

*Used for GitHub Deployment status*

Value : `String`

### `environment`

The environment that is being used ( `staging`, `production`, etc. ).

*Used for GitHub Deployment status*

Value : `String`

Default : `production`

### `description`

The description of your deployment.

*Used for GitHub Deployment status*

Value : `String`

### `githubToken`

GitHub token, that has access to `deployment_status` of the repo.

*Used for GitHub Deployment status*

Value : `String`

## Receiving options from env

Don't store the values of the options inside your Gulpfile.js. Use env
variables for that.

Example : 

```
{
    environment : process.env["NODE_ENV"],
    remotePath : process.env["DEPLOY_SERVER_PATH"],
    host : process.env["DEPLOY_SERVER_HOST"],
    user : process.env["DEPLOY_SERVER_USER"],
    key : "~/id_rsa_deployment.key",
    revision : process.env["CIRCLE_SHA1"],
    branch : process.env["CIRCLE_BRANCH"],
    githubToken : process.env["GITHUB_DEPLOY_TOKEN"]
}
```

## License

MIT
