import Anthropic from '@anthropic-ai/sdk';
import { AnthropicResponseHandler } from './AnthropicResponseHandler';
import type { MessageParam } from '@anthropic-ai/sdk/src/resources/messages';
import type { Channel, DefaultGenerics, Event, StreamChat } from 'stream-chat';
import type { AIAgent } from '../types';
import { content } from '../../content';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from 'langchain/document';
import { MemoryVectorStore } from 'langchain/vectorstores/memory';

type WebsitePage = {
  text: string;
  url: string;
};

type ChatRequest = {
  message: string;
};

type ChatResponse = {
  response: string;
  relevantPages?: {
    title: string;
    url: string;
  }[];
};

type Doc = {
  pageContent: string;
  metadata: Record<string, string>;
}

let vectorStore: MemoryVectorStore | null = null;

const embeddings = new OpenAIEmbeddings({
  openAIApiKey: process.env.OPENAI_API_KEY || '',
});

async function initializeVectorStore() {
  const documents = content.map(
    (page) => new Document({
      pageContent: page.text,
      metadata: { url: page.url },
    })
  );
  
  vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
  console.log("Vector store initialized with website content");
}

async function searchRelevantContent(query: string, k: number = 3) {
  if (!vectorStore) {
    console.log("Vector store not initialized yet");
    return [];
  }
  
  const results = await vectorStore.similaritySearch(query, k);
  return results;
}

export class AnthropicAgent implements AIAgent {
  private anthropic?: Anthropic;
  private handlers: AnthropicResponseHandler[] = [];
  private lastInteractionTs = Date.now();

  constructor(
    readonly chatClient: StreamChat,
    readonly channel: Channel,
  ) {}

  dispose = async () => {
    this.chatClient.off('message.new', this.handleMessage);
    await this.chatClient.disconnectUser();

    this.handlers.forEach((handler) => handler.dispose());
    this.handlers = [];
  };

  getLastInteraction = (): number => this.lastInteractionTs;

  init = async () => {
    const apiKey = process.env.ANTHROPIC_API_KEY as string | undefined;
    if (!apiKey) {
      throw new Error('Anthropic API key is required');
    }
    this.anthropic = new Anthropic({ apiKey });

    initializeVectorStore().catch(console.error);

    this.chatClient.on('message.new', this.handleMessage);
  };

  private handleMessage = async (e: Event<DefaultGenerics>) => {
    if (!this.anthropic) {
      console.error('Anthropic SDK is not initialized');
      return;
    }

    if (!e.message || e.message.ai_generated) {
      console.log('Skip handling ai generated message');
      return;
    }

    const message = e.message.text;
    if (!message) return;

    const relevantContent = await searchRelevantContent(message);

    this.lastInteractionTs = Date.now();

    const messages = this.channel.state.messages
      .slice(-5)
      .filter((msg) => msg.text && msg.text.trim() !== '')
      .map<MessageParam>((message) => ({
        role: message.user?.id.startsWith('ai-bot') ? 'assistant' : 'user',
        content: message.text || '',
      }));

    if (e.message.parent_id !== undefined) {
      messages.push({
        role: 'user',
        content: message,
      });
    }

    const contextContent = relevantContent
      .map((doc: Doc) => {
        return `Page: (${doc.metadata.url})\nContent: ${doc.pageContent}`;
      })
      .join('\n\n');

    const systemPrompt = `
      Your Role:
        You are a helpful assistant for Interact Software’s website. 
        Your task is to answer questions based on the information provided in the **Website Information** and **General Information** sections. 
        If the information is insufficient or unclear, suggest contacting support at support@interactsoftware.com.

      Website Information:
        ${contextContent || 'No specific information available for this query.'}

      General Information:
        - We provide web intranet services.
        - Our support hours are 9am-5pm EST, Monday-Friday.
        - For pricing or specific product inquiries, please direct users to contact support.
        
      Output Format:
        - Provide a **concise summary** of the relevant content, including the **page link** as a reference at the end of the summary, formatted as: [Summary of content]. [https://relevant_page_link]
        
      Additional Instructions:
        - If the query is unclear or out of scope, ask for clarification.
        - **Do not** provide any sensitive or private information.
        - Ensure your response is **clear, concise, and directly addresses the user’s query**.
        
      ### Example Interaction:
      
      **Question:** "What are the opening hours of Interact Software’s office?"
      
      **Response:**  
      - First, check the **Website Information** for relevant content.
      - If the information is missing, check the **General Information**.
      - In this case, the **General Information** section provides the answer: "Our support hours are 9am-5pm EST, Monday-Friday."
      - Use the **Output Format** to summarize the information clearly and append the relevant page link:

      **Answer:**  
      "Our office hours are 9am-5pm EST, Monday-Friday. [https://relevant_page_link]"

      **Scenario with Missing Information:**  
      - If the question cannot be answered based on the available data, reply with: "I couldn't find the information you're looking for. Please contact support at support@interactsoftware.com for further assistance."
      - If the question is unclear, ask for more details: "Could you please clarify your question?"
    `;

    const anthropicStream = await this.anthropic.messages.create({
      max_tokens: 1024,
      system: systemPrompt,
      messages,
      model: 'claude-3-5-sonnet-20241022',
      stream: true,
    });

    const { message: channelMessage } = await this.channel.sendMessage({
      text: '',
      ai_generated: true,
    });

    try {
      await this.channel.sendEvent({
        type: 'ai_indicator.update',
        ai_state: 'AI_STATE_THINKING',
        message_id: channelMessage.id,
      });
    } catch (error) {
      console.error('Failed to send ai indicator update', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 750));

    const handler = new AnthropicResponseHandler(
      anthropicStream,
      this.chatClient,
      this.channel,
      channelMessage,
    );
    void handler.run();
    this.handlers.push(handler);
  };
}
