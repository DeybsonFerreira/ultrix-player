import { AfterViewInit, Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { appConfig } from '../../../models/appConfig';
import { ConfigService } from '../../../services/config-service';

import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';

let materialModules = [MatDialogModule, MatInputModule, MatButtonModule];

@Component({
  selector: 'app-config-dialog',
  imports: [FormsModule, materialModules],
  templateUrl: './config-dialog.html',
  styleUrl: './config-dialog.scss',
})
export class ConfigDialogComponent implements AfterViewInit {

  config: appConfig;

  ngAfterViewInit() {
    setTimeout(() => {
      document.querySelector('input')?.focus();
    }, 100);
  }

  constructor(
    private dialogRef: MatDialogRef<ConfigDialogComponent>,
    private configService: ConfigService
  ) {
    this.config = this.configService.getConfig();
  }

  save() {
    this.configService.saveLogin(this.config);
    this.dialogRef.close();
  }

  close() {
    this.dialogRef.close();
  }
}