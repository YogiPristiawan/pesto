import { eta, http } from "../mod.ts";
import * as log from "./logger.ts";
import { HttpError } from "./error.ts";

interface AppConfig {
  port: number;
  eta: Partial<typeof eta.config>;
  publicPath: string;
}

export class App {
  private readonly MIME_TYPES = Object.freeze({
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    png: "image/png",
    jpg: "image/jpeg",
    woff: "font/woff",
    ico: "image/x-icon",
    txt: "text/plain",
  });

  private readonly _config: AppConfig;

  constructor(config: AppConfig) {
    this._config = config;
  }

  public run() {
    return http.serve(this._handleConnection.bind(this), {
      port: this._config.port,
      onError: this._handleErrors.bind(this),
    });
  }

  private _handleConnection(req: Request) {
    const url = new URL(req.url);

    if (req.method === "GET") {
      if (url.pathname === "/") return this._homepageHandler();
      return this._staticFileHandler(req);
    }

    throw new HttpError(400, "Bad Request. Method is not supported.");
  }

  private async _handleErrors(err: unknown) {
    let message: string;
    let status: number;

    // no match expression this is so sad
    if (err instanceof HttpError) {
      message = err.message;
      status = err.status;
    } else if (err instanceof Error) {
      message = err.message;
      status = 500;
    } else {
      message = "Unknown error.";
      status = 500;
    }

    log.error(`${message}`);

    const page = await this._compile("pages/error.hbs", {
      errorMessage: message,
    });
    if (page === undefined) {
      return new Response("Failed to render the page.", {
        status: 500,
        headers: { "Content-Type": this.MIME_TYPES["txt"] },
      });
    }

    return new Response(page, {
      status: status,
      headers: { "content-type": this.MIME_TYPES["html"] },
    });
  }

  private _compile(file: string, data = {}) {
    return eta.renderFile(file, data, this._config.eta);
  }

  private async _homepageHandler() {
    const page = await this._compile("pages/index.hbs");
    if (page === undefined) {
      throw new HttpError(500, "Failed to render the homepage.");
    }

    return new Response(page, {
      status: 200,
      headers: { "Content-Type": this.MIME_TYPES["html"] },
    });
  }

  private async _staticFileHandler(req: Request) {
    const url = new URL(req.url);
    const extension = url.pathname.split(".").pop();
    const mimetype =
      this.MIME_TYPES[extension as keyof typeof this.MIME_TYPES] ??
      "text/plain";

    log.info(`Serving ${url.pathname}`);

    try {
      const file = await Deno.readFile(
        `${this._config.publicPath}/${url.pathname}`
      );
      return new Response(file, {
        status: 200,
        headers: { "content-type": mimetype },
      });
    } catch {
      throw new HttpError(404, "Page not found.");
    }
  }
}
