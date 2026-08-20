import { modelLoader } from "./modelLoader";

export const buildRAG = async () => {
  const {
    slice: sliceModel,
    judge: judgeModel,
    embedding: embeddingModel
  } = await modelLoader();

  const 
};