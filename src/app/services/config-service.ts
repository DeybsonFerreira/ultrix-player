import { Injectable } from '@angular/core';
import { appConfig } from '../models/appConfig';


@Injectable({ providedIn: 'root' })
export class ConfigService {


  getConfig(): appConfig {

    return {
      phoneNumberSupport: this.getPhoneNumberSupport(),
      macId: this.getMacId(),
      tvCode: this.getTvCode()
    };
  }

  getMacId(): string {
    return "24:fC:AA:BB:CC:DD";
  }

  getTvCode(): string {
    return "85970";
  }

  saveLogin(config: appConfig) {

  }

  getPhoneNumberSupport(): string {
    return "+55 (19) 97107-6785";
  }
}