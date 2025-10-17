import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Post } from './entities/post.entity';
import { User } from '../users/entities/user.entity';
import { Comment } from './entities/comment.entity';
import { Like } from './entities/like.entity';
import { CREATE_POST } from 'src/common/constants/xp';

@Injectable()
export class PostsService {
  constructor(
    @InjectRepository(Post) private postsRepository: Repository<Post>,
    @InjectRepository(User) private usersRepository: Repository<User>,
    @InjectRepository(Comment) private commentsRepository: Repository<Comment>,
    @InjectRepository(Like) private likesRepository: Repository<Like>,
  ) {}

  // Create a post
  async createPost(userId: number, content: string, medias?: string[]) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const post = this.postsRepository.create({ content, medias, author: user });
    const savePost = await this.postsRepository.save(post);
    if (savePost.id) {
      user.xp += CREATE_POST;
      const add_xp_to_user = await this.usersRepository.save(user);
      return { message: 'Post created successfully' };
    }
    throw new BadRequestException('Unable to create post');
  }

  // Get all posts
  async getAllPosts() {
    const posts = await this.postsRepository.find({
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });

    const result = posts.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt,
      medias: post.medias,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      author: {
        id: post.author.id,
        username: post.author.username,
        photo: post.author.photo,
      },
    }));
    return result;
  }

  // Get one post by id (with comments & nested replies)
  async getPostById(postId: number) {
    const post = await this.postsRepository.findOne({
      where: { id: postId },
      relations: [
        'author',
        'comments',
        'comments.author',
        'comments.replies',
        'comments.replies.author',
        'likes',
      ],
    });
    if (!post) throw new NotFoundException('Post not found');

    return post;
  }

  // Edit a post
  async editPost(
    userId: number,
    postId: number,
    data: { content?: string; medias?: string[] },
  ) {
    const post = await this.postsRepository.findOne({
      where: { id: postId },
      relations: ['author'],
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.author.id !== userId) {
      throw new ForbiddenException('You are not allowed to edit this post');
    }

    if (data.content !== undefined) post.content = data.content;
    if (data.medias !== undefined) post.medias = data.medias;

    return this.postsRepository.save(post);
  }

  // Delete post
  async deletePost(userId: number, postId: number) {
    const post = await this.postsRepository.findOne({
      where: { id: postId },
      relations: ['author'],
    });
    if (!post) throw new NotFoundException('Post not found');

    if (post.author.id !== userId) {
      throw new ForbiddenException('You are not allowed to delete this post');
    }

    await this.postsRepository.remove(post);
    return { message: 'Post deleted' };
  }

  // Toggle like / unlike
  async toggleLike(userId: number, postId: number) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.likesRepository.findOne({
      where: {
        user: { id: user.id },
        post: { id: post.id },
      },
    });

    if (existing) {
      // Unlike
      await this.likesRepository.remove(existing);
      return { message: 'Post unliked' };
    } else {
      // Like
      const like = this.likesRepository.create({ user, post });
      await this.likesRepository.save(like);
      return { message: 'Post liked' };
    }
  }

  // Add comment or reply
  async addComment(
    userId: number,
    postId: number,
    content: string,
    parentId?: number,
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const post = await this.postsRepository.findOne({ where: { id: postId } });
    if (!post) throw new NotFoundException('Post not found');

    let parent: Comment | null = null;
    if (parentId) {
      parent = await this.commentsRepository.findOne({
        where: { id: parentId },
        relations: ['post'],
      });
      if (!parent) throw new NotFoundException('Parent comment not found');
      if (parent.post.id !== postId) {
        throw new ForbiddenException(
          'Parent comment not associated with this post',
        );
      }
    }

    const comment = this.commentsRepository.create({
      content,
      author: user,
      post,
      parent: parent ?? undefined,
    });
    return this.commentsRepository.save(comment);
  }

  // Edit comment
  async editComment(userId: number, commentId: number, newContent: string) {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: ['author'],
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.author.id !== userId) {
      throw new ForbiddenException('You cannot edit this comment');
    }

    comment.content = newContent;
    return this.commentsRepository.save(comment);
  }

  // Delete comment (and its replies)
  async deleteComment(userId: number, commentId: number) {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: ['author', 'replies'],
    });
    if (!comment) throw new NotFoundException('Comment not found');

    if (comment.author.id !== userId) {
      throw new ForbiddenException('You cannot delete this comment');
    }

    await this.commentsRepository.remove(comment);
    return { message: 'Comment deleted' };
  }

  // Get all posts by username
  async getPostsByUsername(username: string) {
    const user = await this.usersRepository.findOne({ where: { username } });
    if (!user) throw new NotFoundException('User not found');

    const posts = await this.postsRepository.find({
      where: { author: { id: user.id } },
      relations: ['author'],
      order: { createdAt: 'DESC' },
    });
    const result = posts.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt,
      medias: post.medias,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      author: {
        id: post.author.id,
        username: post.author.username,
        photo: post.author.photo,
      },
    }));
    return result;
  }

  // Get my posts
  async getMyPosts(userId: number) {
    const posts = await this.postsRepository
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.author', 'author')
      .leftJoinAndSelect('post.likes', 'likes')
      .leftJoinAndSelect('likes.user', 'likeUser')
      .loadRelationCountAndMap('post.commentCount', 'post.comments')
      .loadRelationCountAndMap('post.likeCount', 'post.likes')
      .addSelect(['author.id', 'author.username', 'author.photo'])
      .addSelect(['likeUser.id'])
      .where('author.id = :userId', { userId })
      .orderBy('post.createdAt', 'DESC')
      .getMany();

    const result = posts.map((post) => ({
      id: post.id,
      content: post.content,
      createdAt: post.createdAt,
      medias: post.medias,
      commentCount: post.commentCount,
      likeCount: post.likeCount,
      hasLiked: post.likes?.some((like) => like.user?.id == userId) || false,
      author: {
        id: post.author.id,
        username: post.author.username,
        photo: post.author.photo,
      },
    }));
    return result;
  }
}
