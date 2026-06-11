import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

interface DemoUser {
  email: string;
  password: string;
  fullName: string;
  role: string;
  roleLabel: string;
  department: string;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'admin@example.com',       password: 'Admin123*',      fullName: 'Administrador General', role: 'administrador', roleLabel: 'Admin',       department: 'Dirección General' },
  { email: 'supervisor@example.com',   password: 'Supervisor123*', fullName: 'Supervisor Principal',  role: 'supervisor',    roleLabel: 'Supervisor',  department: 'Operaciones' },
  { email: 'funcionario@example.com',  password: 'Funcionario123*', fullName: 'Funcionario Operativo', role: 'funcionario',   roleLabel: 'Funcionario', department: 'Operaciones' },
  { email: 'maria.garcia@example.com', password: 'Maria123*',      fullName: 'María García López',     role: 'supervisor',    roleLabel: 'Supervisor',  department: 'Recursos Humanos' },
  { email: 'carlos.torres@example.com',password: 'Carlos123*',     fullName: 'Carlos Torres Ramírez',  role: 'funcionario',   roleLabel: 'Funcionario', department: 'Tesorería' },
  { email: 'ana.martinez@example.com', password: 'Ana123*',        fullName: 'Ana Martínez Gómez',     role: 'funcionario',   roleLabel: 'Funcionario', department: 'Compras y Contrataciones' },
  { email: 'juan.perez@example.com',   password: 'Juan123*',       fullName: 'Juan Pérez Rodríguez',   role: 'supervisor',    roleLabel: 'Supervisor',  department: 'Tecnología de la Información' },
  { email: 'rosa.nunez@example.com',   password: 'Rosa123*',       fullName: 'Rosa Núñez Díaz',        role: 'funcionario',   roleLabel: 'Funcionario', department: 'Asesoría Legal' },
  { email: 'diego.herrera@example.com',password: 'Diego123*',      fullName: 'Diego Herrera Silva',    role: 'funcionario',   roleLabel: 'Funcionario', department: 'Infraestructura y Mantenimiento' },
  { email: 'lucia.vargas@example.com', password: 'Lucia123*',      fullName: 'Lucía Vargas Flores',    role: 'supervisor',    roleLabel: 'Supervisor',  department: 'Archivo y Documentación' },
  { email: 'fernando.castro@example.com',password:'Fernando123*',  fullName: 'Fernando Castro Mendoza',role: 'funcionario',   roleLabel: 'Funcionario', department: 'Control Interno' },
  { email: 'elena.rivera@example.com', password: 'Elena123*',      fullName: 'Elena Rivera Cortés',    role: 'supervisor',    roleLabel: 'Supervisor',  department: 'Operaciones' },
  { email: 'sofia.mendez@example.com', password: 'Sofia123*',      fullName: 'Sofía Méndez Rivas',     role: 'funcionario',   roleLabel: 'Funcionario', department: 'Operaciones' },
  { email: 'lorena.quispe@example.com',password:'Lorena123*',      fullName: 'Lorena Quispe Molina',   role: 'funcionario',   roleLabel: 'Funcionario', department: 'Tesorería' },
  { email: 'martin.rojas@example.com', password: 'Martin123*',     fullName: 'Martín Rojas Vargas',    role: 'funcionario',   roleLabel: 'Funcionario', department: 'Compras y Contrataciones' },
  { email: 'hector.suarez@example.com',password:'Hector123*',      fullName: 'Héctor Suárez León',     role: 'funcionario',   roleLabel: 'Funcionario', department: 'Asesoría Legal' },
  { email: 'patricia.arias@example.com',password:'Patricia123*',   fullName: 'Patricia Arias Salinas',  role: 'funcionario',   roleLabel: 'Funcionario', department: 'Infraestructura y Mantenimiento' },
  { email: 'veronica.pena@example.com',password:'Veronica123*',    fullName: 'Verónica Peña Duarte',   role: 'funcionario',   roleLabel: 'Funcionario', department: 'Control Interno' },
];

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login-page.component.html',
  styleUrl: './login-page.component.scss',
})
export class LoginPageComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly errorMessage = signal('');
  readonly demoUsers = DEMO_USERS;

  readonly form = this.fb.nonNullable.group({
    email: ['admin@example.com', [Validators.required, Validators.email]],
    password: ['Admin123*', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.submitting.set(true);

    const { email, password } = this.form.getRawValue();
    this.authService.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigateByUrl(this.authService.defaultRouteForRole());
      },
      error: (error) => {
        this.submitting.set(false);
        this.errorMessage.set(error?.error?.detail ?? 'No se pudo iniciar sesión');
      },
    });
  }

  loginAs(user: DemoUser): void {
    this.form.setValue({ email: user.email, password: user.password });
    this.submit();
  }
}
