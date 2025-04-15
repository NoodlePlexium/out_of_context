const session = require('express-session');
const express = require('express');
const socketIo = require('socket.io');
const http = require('http');
const uuid = require('uuid');
const path = require('path');
const cors = require('cors');

// -------------------- CREATE APP -------------------- //
const port = process.env.PORT || 8080;
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
// -------------------- CREATE APP -------------------- //



// -------------------- MIDDLEWARE -------------------- //
app.use('/styles', express.static(path.join(__dirname, 'styles')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));
app.use(express.urlencoded( { extended: true }));
app.use(express.json());
app.use(cors());
// -------------------- MIDDLEWARE -------------------- //



// -------------------- CLIENT SESSIONS -------------------- //
let clientSessions = {};
app.use(session({secret: 'your-secret-key', resave: false, saveUninitialized: true, cookie: {secure: false}}));
app.use((req, res, next) => {
    if (!req.session.clientId) req.session.clientId = uuid.v4(); 
    if (!clientSessions[req.session.clientId]) // INIT SESSION 
    {
        clientSessions[req.session.clientId] = {
            sessionId: req.session.id, 
            clientId: req.session.clientId,  
            gamertag: 'Guest',
            playerIcon: ChooseRandomPlayerIcon(),
            gameID: null
        };
        console.log("New client session created:", clientSessions[req.session.clientId]);
    }
    next();
});
// -------------------- CLIENT SESSIONS -------------------- //



// -------------------- WEBSOCKET CONNECTIONS -------------------- //
io.on('connection', (socket) => {
    console.log("A user connected");

    // HANDLE PLAYER JOINING A ROOM
    socket.on('joinGame', (gameID) => {
        socket.join(gameID); // ADD THIS SOCKET TO THE GAME ROOM
        console.log(`Socket ${socket.id} joined game room: ${gameID}`);
    });

    // HANDLE PLAYER DISCONNECT
    socket.on('disconnect', () => {
        console.log(`Socket ${socket.id} disconnected`);
    });
});
// -------------------- WEBSOCKET CONNECTIONS -------------------- //



// -------------------- GAME MANAGEMENT -------------------- //
let games = {}; 
let iconNames = ['turtle', 'deer', 'frog', 'chicken'];

function Game() {
    this.players = [];
    this.sentences = [];
    this.playerTurn = 0;
    this.round = 1;
    this.started = false;
}
function ChooseRandomPlayerIcon()
{
    let index = Math.floor(Math.random() * iconNames.length);
    return iconNames[index];
}
// -------------------- GAME MANAGEMENT -------------------- //




function GetClient(req)
{
    const clientId = req.session.clientId;
    return clientSessions[clientId]; 
}


// -------------------- WEBPAGE ENDPOINTS -------------------- //
app.get('/', (req, res) => {
    const client = GetClient(req);
    if (client.gameID != null && games[client.gameID].started) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID != null) res.redirect('/lobby');                           // REDIRECT TO LOBBY
    else res.sendFile(path.join(__dirname, 'views', 'home.html'));                    // RENDER HOME
});

app.get('/lobby', (req, res) => {
    const client = GetClient(req);
    console.log('lobby gameID: ', client.gameID);
    if (client.gameID && games[client.gameID].started) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID == null) res.redirect('/');                        // REDIRECT TO HOME
    else res.sendFile(path.join(__dirname, 'views', 'lobby.html'));           // RENDER LOBBY
});

app.get('/invited', (req, res) => {
    const client = GetClient(req);
    if (client.gameID != null && games[client.gameID].started) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID != null) res.redirect('/lobby');                           // REDIRECT TO LOBBY
    else  res.sendFile(path.join(__dirname, 'views', 'invited.html'));                // RENDER INVITED PAGE
});

app.get('/game', (req, res) => {
    const client = GetClient(req);
    if (client.gameID == null) res.redirect('/');                                                     // REDIRECT TO HOME
    else if (client.gameID != null && games[client.gameID].started == false) res.redirect('/lobby');  // REDIRECT TO LOBBY
    else res.sendFile(path.join(__dirname, 'views', 'game.html'));                                    // RENDER GAME
});
// -------------------- WEBPAGE ENDPOINTS -------------------- //



// -------------------- API ENDPOINTS -------------------- //
app.post('/api/create-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    // CREATE NEW GAME AND ADD PLAYER
    const game = new Game();
    game.players.push(client.clientId);

    // ADD GAME TO LIST OF GAMES
    const gameID = uuid.v4();
    games[gameID] = game;
    client.gameID = gameID;
    req.session.save()

    res.json({url: '/lobby'});
    console.log(`Client ${client.gamertag} created a new game ${gameID}`);
});

app.get('/api/game-id', (req, res) => {
    const client = GetClient(req);
    if (!client) return;
    res.send({ gameID: client.gameID });
});

app.get('/api/client-id', (req, res) => {
    const client = GetClient(req);
    if (!client) return;
    res.send({ clientId: client.clientId });
});

app.get('/api/game-info', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    playerData = {gamertags: [], clientIds: [], icons: []};
    const players = games[client.gameID].players;
    for (let i=0; i<players.length; i++)
    {
        if (players[i] != client.clientId){
            const icon = clientSessions[players[i]].playerIcon;
            const gamertag = clientSessions[players[i]].gamertag;
            const clientId = clientSessions[players[i]].clientId;
            playerData.icons.push(icon);
            playerData.gamertags.push(gamertag);
            playerData.clientIds.push(clientId);
        }
    }

    res.send({ clientId: client.clientId, gameID: client.gameID, gamertag: client.gamertag, icon: client.playerIcon, playerData: playerData });
});

app.get('/api/play-order', (req, res) => {
    const client = GetClient(req);
    if (!client) return;
    res.send({ order: games[client.gameID].players });
});

app.put('/api/end-turn', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    // ADD SENTENCE TO LIST
    games[client.gameID].sentences.push(req.body.sentence);

    let gameEnded = false;

    // UPDATE PLAYER TURN
    if (games[client.gameID].playerTurn == games[client.gameID].players.length - 1) {
        games[client.gameID].playerTurn = 0;

        // INCREMENT THE ROUND
        games[client.gameID].round += 1;

        // GAME ENDS
        gameEnded = games[client.gameID].round > 3;
    }
    else {
        games[client.gameID].playerTurn += 1;
    }

    if (gameEnded)
    {
        // NOTIFY ALL PLAYERS THAT THE GAME HAS ENDED AND SEND THE STORY
        io.to(client.gameID).emit('gameEnded', {
            story: games[client.gameID].sentences.join(' ')
        });
        console.log("GAME ENDED!");
    }
    else
    {
        // NOTIFY ALL PLAYERS IN GAME THAT A PLAYER ENDED THEIR TURN
        console.log("TURN ENDED!");
        io.to(client.gameID).emit('turnEnded', {
            sentence: req.body.sentence,
            playerTurn: games[client.gameID].playerTurn
        });
    }
});

app.post('/api/start-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    // NOTIFY ALL PLAYERS IN GAME ROOM
    io.to(client.gameID).emit('startGame', {
        gamertag: client.gamertag,
        redirect: '/game'
    });

    games[client.gameID].started = true;
    res.json({url: '/game'});
    console.log(`Starting game ${client.gameID} Players: [${games[client.gameID].players}]`);
});

app.post('/api/join-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    const gameID = req.body.gameID;

    // IF GAME IS NOT AVAILABLE
    if (!games[gameID]){
        res.json({url: '/'});
        return;
    }
    if (client.gameID != null && games[client.gameID].started == true)
    {
        res.redirect('/game');
    }
    else
    {
        games[gameID].players.push(client.clientId);
        client.gameID = gameID;
        console.log('join game gameID: ', client.gameID);
        req.session.save();

        // NOTIFY ALL PLAYERS IN ROOM THAT PLAYER JOINED
        io.to(gameID).emit('playerJoined', {
            clientId: client.clientId,
            icon: client.playerIcon,
            gamertag: client.gamertag,
        });

        res.json({url: '/lobby'});
        console.log(`Client ${client.clientId} joined game ${gameID}`);
    }
});

app.put('/api/change-name', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    client.gamertag = req.body.newName;
    req.session.save();
    console.log(`client ${client.clientId} changed their name to ${client.gamertag}`);

    // INFORM OTHER PLAYERS IN GAME 
    const gameID = req.body.gameID;
    if (gameID != null)
    {
        // NOTIFY ALL PLAYERS IN ROOM THAT PLAYER NAME CHANGED
        io.to(gameID).emit('changedName', {
            clientId: client.clientId,
            gamertag: client.gamertag,
        });
    }
});

app.post('/api/change-icon', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    client.playerIcon = ChooseRandomPlayerIcon();
    req.session.save();
    res.json({icon: client.playerIcon});
    console.log(`client ${client.clientId} changed their icon to ${client.playerIcon}`);

    // INFORM OTHER PLAYERS IN GAME 
    const gameID = req.body.gameID;
    console.log(gameID);
    if (gameID != null)
    {
        // NOTIFY ALL PLAYERS IN ROOM THAT PLAYER NAME CHANGED
        io.to(gameID).emit('changedIcon', {
            clientId: client.clientId,
            icon: client.playerIcon,
        });
    }
});

app.post('/api/leave-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    let gameID = client.gameID;
    
    // REMOVE CLIENT FROM GAME
    var gameClientNameIndex = games[gameID].players.indexOf(client.clientId);
    if (gameClientNameIndex !== -1){
        games[gameID].players.splice(gameClientNameIndex, 1);
        console.log(`Client ${client.gameID} leaving game ${client.gameID}`);
    }
    
    // CLIENT IS NO LONGER IN ACTIVE GAME
    client.gameID = null;
    req.session.save()

    if (games[gameID].players.length == 0){
        delete games[gameID];
        console.log(`Deleting game ${gameID} as players have left`);
    }

    // NOTIFY ALL PLAYERS IN GAME THAT PLAYER LEFT
    io.to(gameID).emit('playerLeft', {
        clientId: client.clientId,
        gamertag: client.gamertag,
    });

    res.json({url: '/'});
});

app.get('/api/player-icon', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    res.json({icon: client.playerIcon});
});

app.get('/api/player-gamertag', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    res.json({gamertag: client.gamertag});
});

app.get('/api/get-players-in-lobby', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    data = {gamertags: [], clientIds: [], icons: []};
    const players = games[client.gameID].players;
    for (let i=0; i<players.length; i++)
    {
        if (players[i] != client.clientId){
            const icon = clientSessions[players[i]].playerIcon;
            const gamertag = clientSessions[players[i]].gamertag;
            const clientId = clientSessions[players[i]].clientId;
            data.icons.push(icon);
            data.gamertags.push(gamertag);
            data.clientIds.push(clientId);
        }
    }
    res.json(data);
});

app.post('/api/game-available', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    if (games[req.body.gameID]) res.json({available: true});
    else res.json({available: false});
});
// -------------------- API ENDPOINTS -------------------- //






server.listen(port, '0.0.0.0', ()=> {
    console.log(`Listening on port ${port}`);
});