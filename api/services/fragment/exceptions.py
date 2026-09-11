class BaseFragmentException(Exception):
    pass


class FragmentRequestException(BaseFragmentException):
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class FragmentAPIException(BaseFragmentException):
    def __init__(self, message: str):
        self.message = message
        super().__init__(self.message)


class HashNotFoundException(BaseFragmentException):
    pass


class AccountAlreadyHasPremium(BaseFragmentException):
    def __init__(self, username: str):
        self.username = username


class NoOptionFoundException(BaseFragmentException):
    pass