import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../models/user.entity';
import { Role } from '../models/role.entity';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Role)
    private roleRepository: Repository<Role>,
    private jwtService: JwtService,
  ) {}

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    user.password = await bcrypt.hash(user.password, 10);
    if (userData.roleId) {
      user.roleId = userData.roleId;
    }
    return this.userRepository.save(user);
  }
  async findOne(email: string): Promise<User | undefined> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['role'],
    });
  }

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.findOne(email);
    if (user && (await bcrypt.compare(password, user.password))) {
      const { ...result } = user; // Removed 'password' from destructuring
      return result;
    }
    return null;
  }

  async login(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async refreshToken(user: any) {
    const payload = { email: user.email, sub: user.id };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }
}
