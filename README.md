[![Build Status](https://travis-ci.com/Equibit/explorer.png?branch=development)](https://travis-ci.com/Equibit/explorer)

Equibit Explorer
================


An open source block explorer written in node.js.

### See it in action

*  [Deutsche eMark](http://b.emark.tk/)
*  [Sphere](http://sphere.iquidus.io)
*  [Vertcoin](http://explorer.vertcoin.info/)
*  [Vivo](http://vivo.explorerz.top:3003)
*  [Florincoin](https://florincoin.info/info)
*  [Maxcoin Explorer 1](https://explorer.maxcoinproject.net/)
*  [Maxcoin Explorer 2](https://explorer2.maxcoinproject.net/)


*note: If you would like your instance mentioned here contact me*

### Requires

*  node.js (>= 10.14.1 recommended)
*  mongodb (>= 3.6.3 recommended)
*  *coind

### MongoDB installation

#### Linux (Ubuntu)

    sudo apt install -y mongodb

#### Windows

Follow the instructions found at https://docs.mongodb.com/manual/tutorial/install-mongodb-on-windows/ and make sure you start the mongo service

### Install NVM

#### Linux (NVM)

Download and run the install script

    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash

Add the following to you shell startup file (usually .bashrc or .zshrc)

     [[ -s $HOME/.nvm/nvm.sh ]] && . $HOME/.nvm/nvm.sh  # This loads NVM

#### Windows (NVM-Windows)

Download and run the latest installer from https://github.com/coreybutler/nvm/releases

#### Install the latest Node.js LTS

    nvm install 10.14.1
    nvm use 10.14.1

On Linux you can use this version by default to avoid executing the previous two commands every time a new terminal is opened

    nvm alias default 10.14.1

### Get the source

    git clone https://github.com/equibit/explorer

### Install node modules

    cd explorer && npm install

### Configure

Set the following environment variables:

    MONGO_DB_URI='mongodb://iquidus:3xp!0reR@localhost:27017/explorerdb'
    EQUIBIT_CORE_URL=ip-or-domain-of-node:PORT
    EQUIBIT_CORE_USERNAME=username_of_node
    EQUIBIT_CORE_PASSWORD=password_of_node

On Linux this can be done like: `export ENV_VAR=VALUE`
On Windows this can be done like: `set ENV_VAR=VALUE`

To run in debug mode set the DEBUG environment variable to anything (e.g. `DEBUG=*`).

### Setup Mongo

Ensure the user specified in the `MONGO_DB_URI` has read/write permissions. If needed, you can manually create the database and the user:

    mongo
    > use explorerdb
    > db.createUser( { user: "iquidus", pwd: "3xp!0reR", roles: [ "readWrite" ] } )

Otherwise the explorer will attempt to login with the specified user and create the database automatically.

### Start Explorer

    npm start

### Visit Explorer

Visit `http://localhost:3001` in your browser to see the explorer in action.

*note: mongod must be running to start the explorer*

As of version 1.4.0 the explorer defaults to cluster mode, forking an instance of its process to each cpu core. This results in increased performance and stability. Load balancing gets automatically taken care of and any instances that for some reason die, will be restarted automatically. For testing/development (or if you just wish to) a single instance can be launched with

    node --stack-size=10000 bin/instance

To stop the cluster you can use

    npm stop

### Syncing databases with the blockchain

The explorer automatically syncs with the blockchain on configurable intervals which can be set by modifying the following variables in default.json (in milliseconds):

    "sync_timeout": 60000, // sync the database with the blockchain (includes addresses, transactions, blocks, etc)
    "market_timeout": 120000, // sync the database with enabled markets
    "peer_timeout": 240000, // checks peer connections and records in the database

These scripts can also be called manually.
scripts/sync.js must be called from the explorer's root directory.

    Usage: node scripts/sync.js [database] [mode]

    database: (required)
    index [mode] Main index: coin info/stats, transactions & addresses
    market       Market data: summaries, orderbooks, trade history & chartdata

    mode: (required for index database only)
    update       Updates index from last sync to current block
    check        checks index for (and adds) any missing transactions/addresses
    reindex      Clears index then resyncs from genesis to current block

    notes:
    * 'current block' is the latest created block when script is executed.
    * The market database only supports (& defaults to) reindex mode.
    * If check mode finds missing data(ignoring new data since last sync),
      index_timeout in settings.json is set too low.

scripts/peers.js must be called from the explorer's root directory.

    Usage: node scripts/peers.js

### Wallet

Iquidus Explorer is intended to be generic so it can be used with any wallet following the usual standards. The wallet must be running with atleast the following flags

    -daemon -txindex

### Donate

    BTC: 168hdKA3fkccPtkxnX8hBrsxNubvk4udJi
    JBS: JZp9893FMmrm1681bDuJBU7c6w11kyEY7D

### Known Issues

**script is already running.**

If you receive this message when launching the sync script either a) a sync is currently in progress, or b) a previous sync was killed before it completed. If you are certian a sync is not in progress remove the index.pid from the tmp folder in the explorer root directory.

    rm tmp/index.pid

**exceeding stack size**

    RangeError: Maximum call stack size exceeded

Nodes default stack size may be too small to index addresses with many tx's. If you experience the above error while running sync.js the stack size needs to be increased.

To determine the default setting run

    node --v8-options | grep -B0 -A1 stack_size

To run sync.js with a larger stack size launch with

    node --stack-size=[SIZE] scripts/sync.js index update

Where [SIZE] is an integer higher than the default.

*note: SIZE will depend on which blockchain you are using, you may need to play around a bit to find an optimal setting*

### License

Copyright (c) 2015, Iquidus Technology  
Copyright (c) 2015, Luke Williams  
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.

* Neither the name of Iquidus Technology nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
