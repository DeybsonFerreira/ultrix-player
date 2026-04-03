import { Injectable } from '@angular/core';
import { appConfig } from '../models/appConfig';


@Injectable({ providedIn: 'root' })
export class ConfigService {

  private KEY = 'ultrix_config';

  getConfig(): appConfig {
    const data = localStorage.getItem(this.KEY);

    return {
      username: data ? JSON.parse(data).username : '',
      password: data ? JSON.parse(data).password : '',
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
    localStorage.setItem(this.KEY, JSON.stringify(config));
  }

  getPhoneNumberSupport(): string {
    return "+55 (19) 97107-6785";
  }
}