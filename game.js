class Game 
{
    constructor(gameID)
    {
        this.gameID = gameID;
        this.clientIDs = [];
        this.playersReady = {};
        this.stories = [];
        this.round = 1;
        this.gameStarted = false;
        this.gameEnded = false;
    }

    AddSentence(sentence, clientID)
    {
        const mod = (n, m) => ((n % m) + m) % m;

        // DETERMINE WHICH STORY SENTENCE IS A PART OF
        let clientIndex = this.clientIDs.indexOf(clientID);
        let storyIndex = mod((clientIndex - this.round), this.clientIDs.length);
        this.stories[storyIndex].push(sentence);
    }

    NextRound()
    {
        this.round += 1;

        // RESET READY STATUS FOR ALL PLAYERS
        for (const clientID in this.playersReady)
        {
            this.playersReady[clientID] = false;
        }
    }

    PreviousSentenceIndices()
    {
        const mod = (n, m) => ((n % m) + m) % m;

        let result = {};
        for (let i=0; i<this.clientIDs.length; i++)
        {
            const clientID = this.clientIDs[i];
            result[clientID] = mod(i - 1 - this.round, this.clientIDs.length);;
        }
        return result;
    }

    PlayAgain()
    {
        this.stories = [];
        for (const clientID in this.playersReady)
        {
            this.playersReady[clientID] = false;
            this.stories.push([]);
        }
        this.round = 1;
        this.gameEnded = false;
    }

    StartGame()
    {
        for (const clientID in this.playersReady)
        {
            this.playersReady[clientID] = false;
            this.stories.push([]);
        }
        this.gameStarted = true;
    }

    EndGame()
    {
        this.gameEnded = true;

        // RESET READY STATUS FOR ALL PLAYERS
        for (const clientID in this.playersReady)
        {
            this.playersReady[clientID] = false;
        }
    }

    JoinGame(clientID)
    {
        this.clientIDs.push(clientID);
        this.playersReady[clientID] = false;
        console.log(`Player ${clientID} joined game ${this.gameID}`);
    }

    LeaveGame(clientID)
    {
        var playerIndex = this.clientIDs.indexOf(clientID);
        if (playerIndex !== -1)
        {
            // REMOVE PLAYER
            this.clientIDs.splice(playerIndex, 1);
            delete this.playersReady[clientID];
            console.log(`Player ${clientID} left game ${this.gameID}`);

            // REMOVE PLAYER'S STORY
            if (this.gameStarted && this.stories[playerIndex])
            {
                this.stories.splice(playerIndex, 1);
            }
        }
    }

    PlayerReady(clientID)
    {
        this.playersReady[clientID] = true;
    }

    IsPlayerReady(clientID)
    {
        return this.playersReady[clientID];
    }

    AllPlayersReady()
    {
        for (const clientID in this.playersReady)
        {
            if (this.playersReady[clientID] == false) return false;
        }
        return true;
    }

    IsPlayerInGame(clientID)
    {
        var playerIndex = this.clientIDs.indexOf(clientID);
        return playerIndex !== -1;
    }

    HasPlayers()
    {
        return this.clientIDs.length != 0;
    }
}

module.exports = Game;