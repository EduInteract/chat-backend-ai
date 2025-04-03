## AI Assistant Node.js

The project exposes two endpoints:
- /start-ai-agent - this will create an AI agent, that will join a channel where it was invoked from.
- /stop-ai-agent - this will stop the AI agent and leave the channel.

Depending on your use-case, you can call these either on channel appearance or by tapping on a UI element (e.g. Ask AI button).

## Usage

In order to run the server locally, you would need to perform the following steps:

### Setup the `.env` file

There's a `.env.example` that you can use as a template. You should provide values for the following keys in your `.env` file:

```
ANTHROPIC_API_KEY=insert_your_key
STREAM_API_KEY=insert_your_key
STREAM_API_SECRET=insert_your_secret
OPENAI_API_KEY=insert_your_key
OPENWEATHER_API_KEY=insert_your_key
```

You can provide a key for either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`, depending on which one you would use. The `OPENWEATHER_API_KEY` is optional, in case you want to use the function calling example with OpenAI.

### Install the dependencies

In order to install the dependencies, you should run the following command:

```
npm install
```

### Running the project

In order to run the project, you should run:

```
npm start
```

This will start listening for requests on localhost:3000.
