import { useEffect, useRef } from "react";

export function useSSE(onEvent) {
  const onEventRef = useRef(onEvent);

  onEventRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource("/events");

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEventRef.current?.(data);
      } catch (error) {
        console.error("Failed to parse SSE event:", error);
      }
    };

    return () => {
      source.close();
    };
  }, []);
}
