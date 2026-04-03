import { Injectable } from '@angular/core';
import { Channel } from '../models/channel';

@Injectable({
  providedIn: 'root'
})
export class IptvService {

  private cache: Channel[] | null = null;

}