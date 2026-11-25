import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { REGIONES, ubicacionDeComuna } from '../core/divisiones-chile';

/**
 * Tres listas encadenadas: región, provincia y comuna. Solo la comuna se guarda en el control del formulario;
 * la región y la provincia se deducen de ella al cargar un paciente que ya tiene comuna.
 */
@Component({
  selector: 'app-selector-comuna',
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <mat-form-field>
      <mat-label>Región</mat-label>
      <mat-select [value]="region()" (selectionChange)="elegirRegion($event.value)">
        @for (r of regiones; track r.nombre) { <mat-option [value]="r.nombre">{{ r.nombre }}</mat-option> }
      </mat-select>
    </mat-form-field>
    <mat-form-field>
      <mat-label>Provincia</mat-label>
      <mat-select [value]="provincia()" [disabled]="!region()" (selectionChange)="elegirProvincia($event.value)">
        @for (p of provincias(); track p.nombre) { <mat-option [value]="p.nombre">{{ p.nombre }}</mat-option> }
      </mat-select>
    </mat-form-field>
    <mat-form-field>
      <mat-label>Comuna</mat-label>
      <mat-select [value]="control().value || null" [disabled]="!provincia()" (selectionChange)="control().setValue($event.value); control().markAsDirty()">
        @for (c of comunas(); track c) { <mat-option [value]="c">{{ c }}</mat-option> }
      </mat-select>
    </mat-form-field>
  `,
  styles: `:host { display: contents; }`,
})
export class SelectorComuna {
  /** Control del formulario que guarda el nombre de la comuna (texto vacío si no hay). */
  readonly control = input.required<FormControl<string>>();

  protected readonly regiones = REGIONES;
  protected readonly region = signal<string | null>(null);
  protected readonly provincia = signal<string | null>(null);
  protected readonly provincias = computed(() => REGIONES.find((r) => r.nombre === this.region())?.provincias ?? []);
  protected readonly comunas = computed(() => this.provincias().find((p) => p.nombre === this.provincia())?.comunas ?? []);

  constructor() {
    // Cuando el formulario cambia la comuna desde fuera (al cargar o reiniciar), se ubican región y provincia.
    effect((onCleanup) => {
      const c = this.control();
      const sincronizar = () => {
        const u = ubicacionDeComuna(c.value ?? '');
        untracked(() => {
          if (u) {
            this.region.set(u.region);
            this.provincia.set(u.provincia);
          } else if (!c.value) {
            this.region.set(null);
            this.provincia.set(null);
          }
        });
      };
      sincronizar();
      const sub = c.valueChanges.subscribe(sincronizar);
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected elegirRegion(nombre: string): void {
    this.region.set(nombre);
    this.provincia.set(null);
    this.control().setValue('');
  }

  protected elegirProvincia(nombre: string): void {
    this.provincia.set(nombre);
    this.control().setValue('');
  }
}
