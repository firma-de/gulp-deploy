"use strict";

var gulp         = require( "gulp" ),
    should       = require( "should" ),
    path         = require( "path" ),
    fs           = require( "fs" ),
    plumber      = require( "gulp-plumber" ),
    ssh2         = require( "ssh2" ),
    buffersEqual = require( "buffer-equal-constant-time" ),
    crypto       = require( "crypto" ),
    util         = require( "util" ),
    gutil        = require( "gulp-util" ),
    nock         = require( "nock" ),
    deploy       = require( "./index.js" );

/**
 * Module tests
 */
describe( "module requirements", function() {

    it( "should export a function", () => {
        deploy.should.be.Function();
    } );

    it( "should throw if no options are provided", () => {
        should.throws( function() { deploy(); } );
    } );

    it( "should throw if no `host` is provided", () => {
        should.throws( function() {
            deploy( {
                user : "deployer",
                key : "../",
                remotePath : "./build"
            } );
        } );
    } );

    it( "should throw if no `key` is provided", () => {
        should.throws( function() {
            deploy( {
                user : "deployer",
                host : "192.168.0.1",
                remotePath : "./build"
            } );
        } );
    } );

    it( "should throw if no `remotePath` is provided", () => {
        should.throws( function() {
            deploy( {
                user : "deployer",
                host : "192.168.0.1",
                key : "../"
            } );
        } );
    } );

    it( "should throw if no `user` is provided", () => {
        should.throws( function() {
            deploy( {
                remotePath : "./build",
                host : "192.168.0.1",
                key : "../"
            } );
        } );
    } );

    it( "should throw if key is not available", () => {
        should.doesNotThrow( function() {
            deploy( {
                remotePath : "./build",
                host : "192.168.0.1",
                key : "./fixtures/no-key.key",
                user : "deployer"
            } );
        } );
    } );

    it( "should not throw when all required options are presented", () => {
        should.doesNotThrow( function() {
            deploy( {
                remotePath : "./build",
                host : "192.168.0.1",
                key : "./fixtures/key.key",
                user : "deployer"
            } );
        } );
    } );

} );

/**
 * SSH Test Server
 */
function acceptFile( client, done ) {

    /** Set defaults */
    const privateKey  = fs.readFileSync( "./fixtures/server_rsa" ),
          options     = { port : 3333, host : "127.0.0.1" },
          server      = new ssh2.Server( { privateKey : privateKey }, onConnection ),
          genKey      = ssh2.utils.genPublicKey,
          parseKey    = ssh2.utils.parseKey,
          key         = fs.readFileSync( './fixtures/deploy_rsa.pub' ),
          pubKey      = genKey( parseKey( key ) ),
          STATUS_CODE = ssh2.SFTP_STATUS_CODE;

    /** Set client callback */
    server.listen( options, err => { if ( err ) { throw err; } else { client() } } );

    /** Accept a connection */
    function onConnection( client ) {

        client
            .on( "authentication", clientAuthenticate )
            .on( "end", () => server.close() )
            .on( "error", err => { } )
            .on( "ready", function() {
                client.on( "session", accept => accept()
                    .on( "sftp", onSFTP ) );
            } );

    }

    /**
     * Authenticate a client with public key
     */
    function clientAuthenticate( ctx ) {

        /** Reject if we are not what we are looking for */
        if ( ctx.method !== "publickey" ||
             ctx.key.algo !== pubKey.fulltype ||
             !buffersEqual( ctx.key.data, pubKey.public )
        ) { return ctx.reject(); }

        /** Accept if we don't have signature */
        if ( !ctx.signature ) { return ctx.accept(); }

        /** Authenticate */
        const verifier = crypto.createVerify( ctx.sigAlgo );

        verifier.update( ctx.blob );

        if ( verifier.verify( pubKey.publicOrig, ctx.signature, 'binary' ) ) {
            ctx.accept();
        } else {
            ctx.reject();
        }

    }

    /**
     * Handle SFTP
     */
    function onSFTP( accept, reject ) {

        /** Our SFTP Stream */
        const sftpStream = accept(),
              openFiles  = {},
              fileNames  = {},
              fileData   = {};

        /** Connections */
        var handleCount = 0;

        /** On connection opened */
        sftpStream.on( 'OPEN', ( reqid, filename, flags, attrs ) => {
            const handle           = new Buffer( 4 );
            openFiles[handleCount] = true;
            fileNames[handleCount] = filename;
            fileData[handleCount]  = [];
            handle.writeUInt32BE( handleCount++, 0, true );
            sftpStream.handle( reqid, handle );
        } );

        /** On writing the file */
        sftpStream.on( 'WRITE', ( reqid, handle, offset, data ) => {
            /** Set file handle */
            const fnum = handle.readUInt32BE( 0, true );
            /** On error */
            if ( handle.length !== 4 || !openFiles[fnum] ) {
                return sftpStream.status( reqid, STATUS_CODE.FAILURE )
            }
            /** Write to our object */
            fileData[fnum].push( data.toString() );
            /** Say the stream was OK */
            sftpStream.status( reqid, STATUS_CODE.OK );
        } );

        sftpStream.on( 'CLOSE', ( reqid, handle ) => {
            /** Set file handle */
            const fnum = handle.readUInt32BE( 0, true );
            /** On error */
            if ( handle.length !== 4 || !openFiles[fnum] ) {
                return sftpStream.status( reqid, STATUS_CODE.FAILURE )
            }
            /** Call done with our buffer */
            delete openFiles[fnum];
            /** Say the stream was okay */
            sftpStream.status( reqid, STATUS_CODE.OK );
            /** Callback */
            done( fileNames[fnum], fileData[fnum].join( "" ) );
        } );

    }

}

function deployFixturePackage() {
    gulp
        .src( "./fixtures/package" )
        .pipe( deploy( {
            remotePath : "./build",
            host : "127.0.0.1",
            port : 3333,
            key : "./fixtures/deploy_rsa",
            user : "deployer"
        } ) );
}

describe( "ssh connectivity", function() {

    var originalLog = gutil.log;

    before( () => gutil.log = function() {} );

    it( "should be able to connect to our server", function( done ) {
        this.slow( 500 );
        acceptFile( deployFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-deployment" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package", { encoding : 'utf-8' } )
            );
            done();
        } );
    } );

    after( ( done ) => {
        setTimeout( function() {
            gutil.log = originalLog;
            done();
        }, 500 );
    } );

} );

describe( "GitHub deployment", function() {

    var originalLog = gutil.log;

    before( () => gutil.log = function() {} );

    it( "should throw error if it can't find a GitHub repository", function( done ) {
        gulp
            .src( "./fixtures/package" )
            .pipe( deploy( {
                remotePath : "./build",
                host : "127.0.0.1",
                port : 3333,
                githubToken : "testToken",
                key : "./fixtures/deploy_rsa",
                user : "deployer"
            } ) )
            .on( "error", () => { done() } );
    } );

    it( "should throw error if url of GitHub repository is wrong", function( done ) {
        gulp
            .src( "./fixtures/package" )
            .pipe( deploy( {
                remotePath : "./build",
                host : "127.0.0.1",
                port : 3333,
                githubToken : "testToken",
                key : "./fixtures/deploy_rsa",
                user : "deployer",
                pkgPath : "./fixtures/package.json"
            } ) )
            .on( "error", () => { done() } );
    } );

    it( "should throw error if there is no user or repo specified", function( done ) {
        gulp
            .src( "./fixtures/package" )
            .pipe( deploy( {
                remotePath : "./build",
                host : "127.0.0.1",
                port : 3333,
                githubToken : "testToken",
                key : "./fixtures/deploy_rsa",
                user : "deployer",
                pkgPath : "./fixtures/package-no-user.json"
            } ) )
            .on( "error", () => { done() } );
    } );

    it( "should not throw error if url of GitHub repository is right", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments' )
            .query( { access_token : "testToken" } )
            .reply( 200, { id : "1234" } );

        acceptFile( deployGitHubFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-1234" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package", { encoding : 'utf-8' } )
            );
            done();
        } );

        function deployGitHubFixturePackage() {
            gulp
                .src( "./fixtures/package" )
                .pipe( deploy( {
                    remotePath : "./build",
                    host : "127.0.0.1",
                    port : 3333,
                    githubToken : "testToken",
                    key : "./fixtures/deploy_rsa",
                    user : "deployer",
                    pkgPath : "./fixtures/package-true.json"
                } ) );
        }

    } );

    it( "should accept proper description", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments', {
                description : "testDescription"
            } )
            .query( { access_token : "testToken" } )
            .reply( 200, { id : "1234" } );

        acceptFile( deployGitHubFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-1234" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package", { encoding : 'utf-8' } )
            );
            done();
        } );

        function deployGitHubFixturePackage() {
            gulp
                .src( "./fixtures/package" )
                .pipe( deploy( {
                    remotePath : "./build",
                    host : "127.0.0.1",
                    port : 3333,
                    githubToken : "testToken",
                    key : "./fixtures/deploy_rsa",
                    user : "deployer",
                    description : "testDescription",
                    pkgPath : "./fixtures/package-true.json"
                } ) );
        }

    } );

    it( "should accept proper revision", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments', { ref : "testRevision" } )
            .query( { access_token : "testToken" } )
            .reply( 200, { id : "1234" } );

        acceptFile( deployGitHubFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-1234" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package", { encoding : 'utf-8' } )
            );
            done();
        } );

        function deployGitHubFixturePackage() {
            gulp
                .src( "./fixtures/package" )
                .pipe( deploy( {
                    remotePath : "./build",
                    host : "127.0.0.1",
                    port : 3333,
                    githubToken : "testToken",
                    key : "./fixtures/deploy_rsa",
                    user : "deployer",
                    revision : "testRevision",
                    pkgPath : "./fixtures/package-true.json"
                } ) );
        }

    } );

    it( "should accept proper environment", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments', { environment : "testEnv" } )
            .query( { access_token : "testToken" } )
            .reply( 200, { id : "1234" } );

        acceptFile( deployGitHubFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-1234" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package", { encoding : 'utf-8' } )
            );
            done();
        } );

        function deployGitHubFixturePackage() {
            gulp
                .src( "./fixtures/package" )
                .pipe( deploy( {
                    remotePath : "./build",
                    host : "127.0.0.1",
                    port : 3333,
                    githubToken : "testToken",
                    key : "./fixtures/deploy_rsa",
                    user : "deployer",
                    environment : "testEnv",
                    pkgPath : "./fixtures/package-true.json"
                } ) );
        }

    } );

    it( "should add a suffix to the filename", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments', { environment : "testEnv" } )
            .query( { access_token : "testToken" } )
            .reply( 200, { id : "1234" } );

        acceptFile( deployGitHubFixturePackage, function( filename, data ) {
            filename.should.equal( "build/package-1234.tar.gz" );
            data.should.equal(
                fs.readFileSync( "./fixtures/package.tar.gz", { encoding : 'utf-8' } )
            );
            done();
        } );

        function deployGitHubFixturePackage() {
            gulp
                .src( "./fixtures/package.tar.gz" )
                .pipe( deploy( {
                    remotePath : "./build",
                    host : "127.0.0.1",
                    port : 3333,
                    githubToken : "testToken",
                    key : "./fixtures/deploy_rsa",
                    user : "deployer",
                    environment : "testEnv",
                    pkgPath : "./fixtures/package-true.json"
                } ) );
        }

    } );

    it( "should throw error if there is error with github", function( done ) {

        this.slow( 500 );

        nock( 'https://api.github.com' )
            .post( '/repos/testuser/testrepo/deployments' )
            .query( { access_token : "testToken" } )
            .reply( 401 );

        gulp
            .src( "./fixtures/package" )
            .pipe( deploy( {
                remotePath : "./build",
                host : "127.0.0.1",
                port : 3333,
                githubToken : "testToken",
                key : "./fixtures/deploy_rsa",
                user : "deployer",
                pkgPath : "./fixtures/package-true.json"
            } ) )
            .on( "error", () => { done() } );

    } );

    after( ( done ) => {
        setTimeout( function() {
            gutil.log = originalLog;
            done();
        }, 500 );
    } );

} );