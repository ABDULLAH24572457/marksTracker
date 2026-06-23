import axios from 'axios';

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError<{ message?: string | string[] }>(error)) {
    const message = error.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join('، ');
    }

    if (message) {
      return message;
    }
  }

  return 'تعذر إكمال العملية. حاول مرة أخرى.';
}
