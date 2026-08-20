import { OpenAI } from '@langchain/openai';
import { file } from 'bun';
import type { CustomModelConfigType, CustomModelConfig } from './custom.model.conf.type';

type ModelLoader = Record<keyof typeof CustomModelConfigType, OpenAI>;

export const modelLoader = async (): Promise<ModelLoader> => {
  try {
    const configFile = file('./custom.model.conf.json');
    if (!(await configFile.exists())) throw new Error('custom.model.conf.json not found');

    const confJson: CustomModelConfig[] = await configFile.json();
    return confJson.reduce((acc, conf) => {
      acc[conf.type] = new OpenAI({
        openAIApiKey: conf.apiKey,
        modelName: conf.model,
        configuration: {
          baseURL: conf.baseURL
        }
      });
      return acc;
    }, {} as ModelLoader);
  } catch (error) {
    console.error(error);
    throw error;
  }
}