export const readable = (parts: AsyncGenerator<string>) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await parts.next();
        if (part.done) controller.close();
        else controller.enqueue(encoder.encode(part.value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await parts.return(undefined);
    },
  });
};
