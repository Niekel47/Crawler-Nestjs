import { Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../dto/user.dto';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    return this.userService.validateUser(email, password);
  }

  async login(user: any) {
    return this.userService.login(user);
  }

  async refreshToken(user: any) {
    return this.userService.refreshToken(user);
  }

  async register(createUserDto: CreateUserDto) {
    const user = await this.userService.create(createUserDto);
    return this.login(user);
  }
}
