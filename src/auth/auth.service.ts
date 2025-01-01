import { Injectable } from '@nestjs/common';
import { UserService } from '../user/user.service';
import { JwtService } from '@nestjs/jwt';
import { CreateUserDto } from '../dto/user.dto';
import { HttpException } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.userService.validateUser(email, password);
    if (!user) {
      throw new HttpException('Invalid credentials', 401);
    }
    return user;
  }

  async login(user: any) {
    const result = await this.userService.login(user);
    return {
      status: 200,
      message: 'Login successful',
      data: result,
    };
  }

  async refreshToken(user: any) {
    const result = await this.userService.refreshToken(user);
    return {
      status: 200,
      message: 'Token refreshed successfully',
      data: result,
    };
  }

  async register(createUserDto: CreateUserDto) {
    try {
      const user = await this.userService.create(createUserDto);
      const loginResult = await this.login(user);
      return {
        status: 201,
        message: 'User registered successfully',
        data: loginResult.data,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException('Failed to register user', 500);
    }
  }
}
