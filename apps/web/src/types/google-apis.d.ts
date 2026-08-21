// Minimal ambient declarations for Google APIs loaded via <script> tags.
// Only covers the surfaces used by useGooglePicker — not a full typing.

interface GapiStatic {
  load(library: string, callback: () => void): void;
}

declare namespace google {
  namespace picker {
    class PickerBuilder {
      addView(view: DocsView | DocsUploadView): this;
      setOAuthToken(token: string): this;
      setDeveloperKey(key: string): this;
      setCallback(callback: (data: PickerResponseObject) => void): this;
      enableFeature(feature: string): this;
      setTitle(title: string): this;
      build(): Picker;
    }

    class DocsView {
      constructor(viewId?: string);
      setMimeTypes(types: string): this;
      setIncludeFolders(include: boolean): this;
    }

    class DocsUploadView {
      constructor(viewId?: string);
    }

    class Picker {
      setVisible(visible: boolean): void;
      dispose(): void;
    }

    const Feature: {
      MULTISELECT_ENABLED: string;
    };

    const ViewId: {
      DOCS: string;
      PHOTOS: string;
    };

    const Action: {
      PICKED: string;
      CANCEL: string;
    };

    interface PickerDocument {
      id: string;
      name: string;
      mimeType: string;
      url: string;
      thumbnails?: Array<{ url: string; width: number; height: number }>;
    }

    interface PickerResponseObject {
      action: string;
      docs?: PickerDocument[];
    }
  }

  namespace accounts {
    namespace oauth2 {
      interface TokenClientConfig {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string }) => void;
      }

      interface TokenResponse {
        access_token: string;
        error?: string;
        error_description?: string;
      }

      interface TokenClient {
        requestAccessToken(config?: { prompt?: string }): void;
      }

      function initTokenClient(config: TokenClientConfig): TokenClient;
    }
  }
}

declare const gapi: GapiStatic;

interface Window {
  gapi?: GapiStatic;
  google?: typeof google;
}
