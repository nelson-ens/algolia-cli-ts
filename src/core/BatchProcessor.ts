export interface BatchProcessorOptions {
  batchSize?: number;
  onBatchStart?: (batchNumber: number) => void;
  onBatchComplete?: (batchNumber: number, itemsProcessed: number) => void;
  onError?: (error: Error, batchNumber: number) => void;
}

export class BatchProcessor<T, R> {
  private options: Required<BatchProcessorOptions>;

  constructor(options: BatchProcessorOptions = {}) {
    this.options = {
      batchSize: options.batchSize || 1000,
      onBatchStart: options.onBatchStart || (() => {}),
      onBatchComplete: options.onBatchComplete || (() => {}),
      onError: options.onError || (() => {}),
    };
  }

  async processItems<TResult = R>(
    items: T[],
    processor: (batch: T[], batchNumber: number) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = [];
    let batchNumber = 0;

    for (let i = 0; i < items.length; i += this.options.batchSize) {
      const batch = items.slice(i, i + this.options.batchSize);
      batchNumber++;

      try {
        this.options.onBatchStart(batchNumber);
        const result = await processor(batch, batchNumber);
        results.push(result);
        this.options.onBatchComplete(batchNumber, batch.length);
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        this.options.onError(errorObj, batchNumber);
        throw errorObj;
      }
    }

    return results;
  }

  static async processInParallel<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>,
    maxConcurrency: number = 10
  ): Promise<R[]> {
    const results: R[] = [];
    
    for (let i = 0; i < items.length; i += maxConcurrency) {
      const batch = items.slice(i, i + maxConcurrency);
      const batchPromises = batch.map((item, index) => 
        processor(item, i + index)
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }
}