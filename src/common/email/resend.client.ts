import { Provider } from "@nestjs/common";
import { Resend } from "resend";
import { loadEnv } from "../config/env";

export const RESEND_CLIENT = "RESEND_CLIENT";

export type ResendClient = Resend;

export const resendClientProvider: Provider = {
  provide: RESEND_CLIENT,
  useFactory: (): ResendClient => {
    const env = loadEnv();
    return new Resend(env.RESEND_API_KEY);
  },
};

