"use strict";

var path    = require( "path" ),
    fs      = require( "fs" ),
    sftp    = require( "gulp-sftp" ),
    gutil   = require( "gulp-util" ),
    rename  = require( "gulp-rename" ),
    GitHub  = require( "github4" ),
    through = require( "through2" ),
    combine = require( "stream-combiner" );

module.exports = function( options ) {

    /** Creates a Plugin Error */
    function pluginError( message ) {
        return new gutil.PluginError( "@firma-de/gulp-deploy", message )
    }

    /** Options sanity check */
    if ( !options ) {
        throw pluginError(
            "`host`, `user`, `remotePath` and `key` are required options" );
    }

    ["host", "user", "remotePath", "key"]
        .filter( option => !options[option] )
        .forEach( option => { throw pluginError( "`" + option + "` is missing" ) } );

    /**
     * We need the following options provided
     */
    const revision    = options["revision"] || "snapshot",
          environment = options["environment"] || "production",
          description = options["description"] || "",
          host        = options["host"],
          user        = options["user"],
          port        = options["port"],
          remotePath  = options["remotePath"],
          key         = options["key"],
          pkgPath     = options["pkgPath"] || path.join( process.cwd(), "package.json" ),
          githubToken = options["githubToken"];

    /**
     * Additional variables
     */
    const github = new GitHub(),
          pkg    = require( pkgPath );

    /**
     * Set the deployment ID from GitHub
     */
    var deploymentId     = "deployment",
        deployedToGitHub = false;

    /**
     * Send GitHub Deployment
     */
    const deployGitHub = through.obj(
        function( chunk, enc, callback ) {

            /** Do nothing if we already deployed */
            if ( deployedToGitHub === true ) { return callback( null, chunk ); }

            /** Do nothing if we don't have a GitHub key */
            if ( !githubToken ) { return callback( null, chunk ); }

            /** Check for username and repository */
            const repoUrl = pkg["repository"] ? pkg["repository"]["url"] : undefined;

            /** Do nothing if we can't find any repository URL */
            if ( !repoUrl || repoUrl.indexOf( "github" ) === -1 ) {
                this.emit( "error", pluginError( "Your repository is not on GitHub" ) );
                return callback();
            }

            /** Check for username and repository name */
            var repoLocation, user, repo;

            try {
                repoLocation = repoUrl.split( ":" )[1].split( "/" );
                user         = repoLocation[0];
                repo         = repoLocation[1] ? repoLocation[1].split( '.' )[0] : null;
            } catch ( err ) {
                this.emit( "error", "We can't find GitHub username or repository name" );
                return callback();
            }

            /** Do nothing if we can't find username & repository name */
            if ( !user || !repo ) {
                this.emit( "error",
                    pluginError( "We can't find GitHub username or repository name" )
                );
                return callback();
            }

            /** Authenticate */
            github.authenticate( {
                type : "oauth",
                token : githubToken
            } );

            /** Create deployment */
            github.repos.createDeployment( {
                user : user,
                repo : repo,
                task : "deploy",
                auto_merge : false,
                required_contexts : [],
                ref : revision,
                environment : environment,
                description : description
            }, ( err, deployment ) => {

                /** Throw any errors if any */
                if ( err ) {
                    this.emit( "error", err );
                    return callback();
                }

                /** Log that we have a deployment */
                gutil.log(
                    "Deployment " + gutil.colors.magenta( deployment.id ) + " created"
                );

                /** Set the deployment ID */
                deploymentId = deployment['id'];

                /** callback */
                callback( null, chunk );

                /** Save */
                deployedToGitHub = true;

            } );

        }
    );

    /**
     * Return a stream
     */
    return combine(
        deployGitHub,
        rename( path => {

            if ( path.basename.indexOf(".") !== -1 ) {
                const f = path.basename.split( "." );
                path.basename = f.shift() + "-" + deploymentId + "." + f.join(".");
            } else {
                path.basename += "-" + deploymentId;
            }

        } ),
        sftp( {
            host : host,
            user : user,
            port : port,
            remotePath : remotePath,
            key : { location : key }
        } )
    );

};

