const session = require('express-session');
const express = require('express');
const socketIo = require('socket.io');
const Game = require('./game');
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
app.set('views', path.join(__dirname, 'views'));
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
// -------------------- GAME MANAGEMENT -------------------- //




let iconNames = ['crab', 'deer', 'eagle', 'flamengo', 'fox', 'hippo', 'peacock', 'penguin', 'shark', 'stalk', 'swan', 'turtle', 'walrus'];
function ChooseRandomPlayerIcon()
{
    let index = Math.floor(Math.random() * iconNames.length);
    return iconNames[index];
}
function GetClient(req)
{
    const clientId = req.session.clientId;
    return clientSessions[clientId]; 
}


// -------------------- WEBPAGE ENDPOINTS -------------------- //
app.get('/', (req, res) => {
    const client = GetClient(req);
    if (client.gameID != null && games[client.gameID].gameStarted) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID != null) res.redirect('/lobby');                           // REDIRECT TO LOBBY
    else res.sendFile(path.join(__dirname, 'views', 'home.html'));                    // RENDER HOME
});

app.get('/lobby', (req, res) => {
    const client = GetClient(req);
    if (client.gameID && games[client.gameID].gameStarted) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID == null) res.redirect('/');                        // REDIRECT TO HOME
    else res.sendFile(path.join(__dirname, 'views', 'lobby.html'));           // RENDER LOBBY
});

app.get('/invited', (req, res) => {
    const client = GetClient(req);
    if (client.gameID != null && games[client.gameID].gameStarted) res.redirect('/game'); // REDIRECT TO ACTIVE GAME
    else if (client.gameID != null) res.redirect('/lobby');                                // REDIRECT TO LOBBY
    else  res.sendFile(path.join(__dirname, 'views', 'invited.html'));                     // RENDER INVITED PAGE
});

app.get('/game', (req, res) => {
    const client = GetClient(req);
    if (client.gameID == null) res.redirect('/');                                                     // REDIRECT TO HOME
    else if (client.gameID != null && games[client.gameID].gameStarted == false) res.redirect('/lobby');  // REDIRECT TO LOBBY
    else res.sendFile(path.join(__dirname, 'views', 'game.html'));                                    // RENDER GAME
});
// -------------------- WEBPAGE ENDPOINTS -------------------- //



// -------------------- API ENDPOINTS -------------------- //
app.post('/api/create-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    // CREATE NEW GAME
    const gameID = uuid.v4();
    const game = new Game(gameID);
    games[gameID] = game;

    // ADD PLAYER TO GAME
    game.JoinGame(client.clientId);
    client.gameID = gameID;
    req.session.save();

    // REDIRECT CLIENT TO LOBBY
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
    const players = games[client.gameID].clientIDs;
    for (let i=0; i<players.length; i++)
    {
        if (players[i] != client.clientId)
        {
            const icon = clientSessions[players[i]].playerIcon;
            const gamertag = clientSessions[players[i]].gamertag;
            const clientId = clientSessions[players[i]].clientId;
            playerData.icons.push(icon);
            playerData.gamertags.push(gamertag);
            playerData.clientIds.push(clientId);
        }
    }

    res.send({ clientID: client.clientId, gameID: client.gameID, gamertag: client.gamertag, icon: client.playerIcon, playerData: playerData });
});

app.put('/api/submit-sentence', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    const game = games[client.gameID];

    // PLAYER ALREADY SUBMITTED
    if (game.IsPlayerReady(client.clientId)) 
    {
        return;
    }

    // ADD SENTENCE TO CORRECT STORY
    game.AddSentence(req.body.sentence, client.clientId);

    // UPDATE PLAYER READY STATUS
    game.PlayerReady(client.clientId);

    // IF ALL PLAYERS HAVE SUBMITTED A SENTENCE -> NEXT ROUND
    if (game.AllPlayersReady())
    {
        // IF ENOUGH ROUNDS HAVE PASSED -> END GAME'
        if (game.round >= 3)
        {
            // NOTIFY ALL PLAYERS THAT THE GAME HAS ENDED
            io.to(client.gameID).emit('gameEnded', {
                stories: game.stories
            });

            game.EndGame();
            return;
        }

        // NOTIFY ALL PLAYERS TO START THE NEXT ROUND
        // SEND ALL PLAYERS A PREVIOUS SENTENCE
        io.to(client.gameID).emit('nextRound', {
            stories: game.stories,
            sentenceIndices: game.PreviousSentenceIndices()
        });

        game.NextRound();
    }
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

app.post('/api/player-ready-to-start', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    games[client.gameID].PlayerReady(client.clientId);

    // ALL PLAYERS ARE READY -> NOTIFY ALL PLAYERS IN THE ROOM TO START GAME
    if (games[client.gameID].AllPlayersReady())
    {   
        // REDIRECT PLAYERS TP GAME PAGE
        io.to(client.gameID).emit('startGame', {
            redirect: '/game'
        });

        // START THE GAME
        games[client.gameID].StartGame();
    }

    // PLAYER IS READY -> NOTIFY ALL PLAYERS IN THE ROOM
    else
    {
        io.to(client.gameID).emit('playerReady', {
            clientID: client.clientId
        });
    }

    res.json({status: "success"});
});

app.post('/api/player-ready-to-play-again', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    games[client.gameID].PlayerReady(client.clientId);

    // ALL PLAYERS ARE READY -> NOTIFY ALL PLAYERS IN THE ROOM TO START GAME
    if (games[client.gameID].AllPlayersReady())
    {   
        // REDIRECT PLAYERS TP GAME PAGE
        io.to(client.gameID).emit('playAgain', {});

        // PLAY AGAIN
        games[client.gameID].PlayAgain();
    }

    // PLAYER IS READY -> NOTIFY ALL PLAYERS IN THE ROOM
    else
    {
        io.to(client.gameID).emit('playerReady', {
            clientID: client.clientId
        });
    }

    res.json({status: "success"});
})

app.post('/api/join-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;

    const gameID = req.body.gameID;

    // IF GAME IS NOT AVAILABLE
    if (!games[gameID])
    {
        return res.json({url: '/'});
    }
    // IF GAME ALREADY STARTED
    if (client.gameID != null && games[client.gameID].gameStarted == true)
    {
        return res.json({url: '/game'});
    }
    else
    {
        // CHECK IF PLAYER IS ALREADY IN THE GAME
        if (games[gameID].IsPlayerInGame(client.clientId)) {
            return res.json({url: '/lobby'});
        }

        // ADD PLAYER TO GAME
        client.gameID = gameID;
        games[gameID].JoinGame(client.clientId);
        req.session.save();

        // NOTIFY ALL PLAYERS IN ROOM THAT PLAYER JOINED
        io.to(gameID).emit('playerJoined', {
            clientID: client.clientId,
            icon: client.playerIcon,
            gamertag: client.gamertag,
        });

        res.json({url: '/lobby'});
    }
});

app.post('/api/leave-game', (req, res) => {
    const client = GetClient(req);
    if (!client) return;
    let gameID = client.gameID;

    // GAME NO LONGER EXISTS
    if (games[gameID] == null)
    {
        return;
    }
    
    // REMOVE PLAYER FROM GAME
    games[gameID].LeaveGame(client.clientId);
    
    // CLIENT IS NO LONGER IN ACTIVE GAME
    client.gameID = null;
    req.session.save()

    // IF GAME HAS NO PLAYERS -> DELETE GAME
    if (!games[gameID].HasPlayers())
    {
        delete games[gameID];
        console.log(`Deleting game ${gameID} as players have left`);
    }
    else
    {
        // NOTIFY ALL PLAYERS IN GAME THAT PLAYER LEFT
        io.to(gameID).emit('playerLeft', {
            clientID: client.clientId,
        });
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
            clientID: client.clientId,
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
    if (gameID != null)
    {
        // NOTIFY ALL PLAYERS IN ROOM THAT PLAYER NAME CHANGED
        io.to(gameID).emit('changedIcon', {
            clientID: client.clientId,
            icon: client.playerIcon,
        });
    }
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

    if (games[req.body.gameID]) 
    {
        if (games[req.body.gameID].gameStarted) return res.json({state: "started"});
        else return res.json({state: "true"});
    }
    else res.json({state: "unavailable"});
});
// -------------------- API ENDPOINTS -------------------- //






server.listen(port, '0.0.0.0', ()=> {
    console.log(`Listening on port ${port}`);
});